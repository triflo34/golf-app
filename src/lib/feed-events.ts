import "server-only";
import { db, type DbApi } from "@/lib/db";

/**
 * Idempotent feed-event generation for a single round. Hooks into all four
 * round-write paths (POST /api/rounds, POST /api/rounds/scorecard, POST
 * /api/rounds/live/[id]/finish, PUT /api/rounds/[id]) via `after()` so the
 * round-save response never waits on this.
 *
 * Every INSERT uses `ON CONFLICT (dedup_key) DO NOTHING` so re-running on
 * round edits is safe — no duplicates, no transactions needed across the
 * whole batch. Events that no longer apply after an edit (e.g. a birdie hole
 * edited away) stay in the feed; the audit log is the source of truth for
 * what changed, and v1 doesn't try to retract events.
 *
 * Live rounds (status='live') are skipped because they have no aggregate
 * `scores` rows yet; events fire after `/finish` flips status to 'final'.
 */

type RoundRow = {
  id: number;
  course_id: number;
  course_name: string;
  played_at: string;
  hole_count: number;
  status: "live" | "final";
};

type ScoreRow = {
  player_id: string | null;
  guest_name: string | null;
  display_name: string | null;
  gross_score: number;
};

type HoleScoreRow = {
  player_id: string | null;
  guest_name: string | null;
  hole_number: number;
  strokes: number;
  par: number | null;
};

const SUB_THRESHOLDS_18 = [70, 80, 90, 100];
const SUB_THRESHOLDS_9 = [35, 40, 45];

function playerKey(playerId: string | null, guestName: string | null): string {
  return playerId ? `u:${playerId}` : `g:${(guestName ?? "").toLowerCase()}`;
}

function displayNameFor(s: { display_name: string | null; guest_name: string | null }): string {
  return s.display_name ?? s.guest_name ?? "Player";
}

export async function generateEventsForRound(roundId: number): Promise<void> {
  try {
    await generateInner(roundId, db);
  } catch (err) {
    // Never let feed generation break a request — log and move on.
    console.error("[feed-events] generation failed for round", roundId, err);
  }
}

async function generateInner(roundId: number, tx: DbApi): Promise<void> {
  const round = await tx
    .prepare(
      `SELECT r.id, r.course_id, c.name AS course_name, r.played_at,
              r.hole_count, r.status
         FROM rounds r
         JOIN courses c ON c.id = r.course_id
        WHERE r.id = ?`,
    )
    .get<RoundRow>(roundId);
  if (!round) return;
  if (round.status !== "final") return; // wait for /finish on live rounds

  const scores = await tx
    .prepare(
      `SELECT s.player_id, s.guest_name, u.display_name, s.gross_score
         FROM scores s
         LEFT JOIN users u ON u.id = s.player_id
        WHERE s.round_id = ?`,
    )
    .all<ScoreRow>(roundId);
  if (scores.length === 0) return;

  // `occurred_at` ties to the round date so feed sorts by *when played*, not
  // when generated. Insert-time on edits doesn't move a round to the top.
  const occurredAt = `${round.played_at}T12:00:00Z`;

  await emitRoundCompleted(tx, round, scores, occurredAt);
  await emitRoundWins(tx, round, scores, occurredAt);

  const holeScores = await tx
    .prepare(
      `SELECT hs.player_id, hs.guest_name, hs.hole_number, hs.strokes, hs.par
         FROM hole_scores hs
        WHERE hs.round_id = ?`,
    )
    .all<HoleScoreRow>(roundId);

  if (holeScores.length > 0) {
    await emitBirdiesEagles(tx, round, holeScores, scores, occurredAt);
    await emitBogeyFreeNines(tx, round, holeScores, scores, occurredAt);
  }

  await emitCareerBests(tx, round, scores, occurredAt);
  await emitFirstSubThresholds(tx, round, scores, occurredAt);
}

async function insertEvent(
  tx: DbApi,
  args: {
    kind: string;
    round_id: number;
    player_id: string | null;
    guest_name: string | null;
    data: Record<string, unknown>;
    occurred_at: string;
    dedup_key: string;
  },
): Promise<void> {
  await tx
    .prepare(
      `INSERT INTO feed_events
         (kind, round_id, player_id, guest_name, data, occurred_at, dedup_key)
       VALUES (?, ?, ?, ?, ?::jsonb, ?, ?)
       ON CONFLICT (dedup_key) DO NOTHING`,
    )
    .run(
      args.kind,
      args.round_id,
      args.player_id,
      args.guest_name,
      JSON.stringify(args.data),
      args.occurred_at,
      args.dedup_key,
    );
}

async function emitRoundCompleted(
  tx: DbApi,
  round: RoundRow,
  scores: ScoreRow[],
  occurredAt: string,
): Promise<void> {
  await insertEvent(tx, {
    kind: "round_completed",
    round_id: round.id,
    player_id: null,
    guest_name: null,
    data: {
      course_name: round.course_name,
      hole_count: round.hole_count,
      player_count: scores.length,
      scores: scores
        .map((s) => ({
          name: displayNameFor(s),
          is_guest: s.player_id == null,
          gross_score: s.gross_score,
        }))
        .sort((a, b) => a.gross_score - b.gross_score),
    },
    occurred_at: occurredAt,
    dedup_key: `round_completed:${round.id}`,
  });
}

async function emitRoundWins(
  tx: DbApi,
  round: RoundRow,
  scores: ScoreRow[],
  occurredAt: string,
): Promise<void> {
  // Win = strict lowest in a field of ≥2 players. Solo rounds don't win.
  if (scores.length < 2) return;
  const min = Math.min(...scores.map((s) => s.gross_score));
  const winners = scores.filter((s) => s.gross_score === min);
  const tied = winners.length > 1;
  for (const w of winners) {
    await insertEvent(tx, {
      kind: "round_win",
      round_id: round.id,
      player_id: w.player_id,
      guest_name: w.guest_name,
      data: {
        name: displayNameFor(w),
        is_guest: w.player_id == null,
        gross_score: w.gross_score,
        tied,
        field_size: scores.length,
        course_name: round.course_name,
        hole_count: round.hole_count,
      },
      occurred_at: occurredAt,
      dedup_key: `round_win:${round.id}:${playerKey(w.player_id, w.guest_name)}`,
    });
  }
}

async function emitBirdiesEagles(
  tx: DbApi,
  round: RoundRow,
  holeScores: HoleScoreRow[],
  scores: ScoreRow[],
  occurredAt: string,
): Promise<void> {
  const nameByKey = new Map(
    scores.map((s) => [playerKey(s.player_id, s.guest_name), displayNameFor(s)]),
  );

  for (const hs of holeScores) {
    const par = hs.par ?? 4;
    const diff = hs.strokes - par;
    if (diff > -1) continue;
    const kind = diff <= -2 ? "eagle" : "birdie";
    const key = playerKey(hs.player_id, hs.guest_name);
    await insertEvent(tx, {
      kind,
      round_id: round.id,
      player_id: hs.player_id,
      guest_name: hs.guest_name,
      data: {
        name: nameByKey.get(key) ?? "Player",
        is_guest: hs.player_id == null,
        hole: hs.hole_number,
        par,
        strokes: hs.strokes,
        course_name: round.course_name,
      },
      occurred_at: occurredAt,
      dedup_key: `${kind}:${round.id}:${key}:${hs.hole_number}`,
    });
  }
}

async function emitBogeyFreeNines(
  tx: DbApi,
  round: RoundRow,
  holeScores: HoleScoreRow[],
  scores: ScoreRow[],
  occurredAt: string,
): Promise<void> {
  const nameByKey = new Map(
    scores.map((s) => [playerKey(s.player_id, s.guest_name), displayNameFor(s)]),
  );

  // Group hole_scores by player_key → list of {hole, par, strokes}
  type Cell = { hole: number; par: number; strokes: number };
  const byPlayer = new Map<string, Cell[]>();
  for (const hs of holeScores) {
    const key = playerKey(hs.player_id, hs.guest_name);
    if (!byPlayer.has(key)) byPlayer.set(key, []);
    byPlayer.get(key)!.push({
      hole: hs.hole_number,
      par: hs.par ?? 4,
      strokes: hs.strokes,
    });
  }

  function checkNine(
    cells: Cell[],
    holeMin: number,
    holeMax: number,
  ): { holes: number; vsPar: number } | null {
    const inNine = cells.filter(
      (c) => c.hole >= holeMin && c.hole <= holeMax,
    );
    if (inNine.length < 9) return null; // need a full nine
    if (inNine.some((c) => c.strokes > c.par)) return null;
    const strokes = inNine.reduce((sum, c) => sum + c.strokes, 0);
    const totalPar = inNine.reduce((sum, c) => sum + c.par, 0);
    return { holes: inNine.length, vsPar: strokes - totalPar };
  }

  for (const [key, cells] of byPlayer) {
    const sample = holeScores.find(
      (h) => playerKey(h.player_id, h.guest_name) === key,
    );
    if (!sample) continue;

    const front = checkNine(cells, 1, 9);
    if (front) {
      await insertEvent(tx, {
        kind: "bogey_free_nine",
        round_id: round.id,
        player_id: sample.player_id,
        guest_name: sample.guest_name,
        data: {
          name: nameByKey.get(key) ?? "Player",
          is_guest: sample.player_id == null,
          which_nine: "front",
          vs_par: front.vsPar,
          course_name: round.course_name,
        },
        occurred_at: occurredAt,
        dedup_key: `bogey_free_nine:${round.id}:${key}:front`,
      });
    }
    const back = checkNine(cells, 10, 18);
    if (back) {
      await insertEvent(tx, {
        kind: "bogey_free_nine",
        round_id: round.id,
        player_id: sample.player_id,
        guest_name: sample.guest_name,
        data: {
          name: nameByKey.get(key) ?? "Player",
          is_guest: sample.player_id == null,
          which_nine: "back",
          vs_par: back.vsPar,
          course_name: round.course_name,
        },
        occurred_at: occurredAt,
        dedup_key: `bogey_free_nine:${round.id}:${key}:back`,
      });
    }
  }
}

async function emitCareerBests(
  tx: DbApi,
  round: RoundRow,
  scores: ScoreRow[],
  occurredAt: string,
): Promise<void> {
  // Only registered players have a "career". Compare to the strict-min gross
  // at the same hole_count played strictly before this round's date.
  for (const s of scores) {
    if (!s.player_id) continue;
    const prior = await tx
      .prepare(
        `SELECT MIN(s2.gross_score)::int AS best
           FROM scores s2
           JOIN rounds r2 ON r2.id = s2.round_id
          WHERE s2.player_id = ?
            AND r2.hole_count = ?
            AND r2.status = 'final'
            AND r2.id <> ?`,
      )
      .get<{ best: number | null }>(s.player_id, round.hole_count, round.id);
    const priorBest = prior?.best ?? null;
    if (priorBest === null) continue; // first round at this hole_count
    if (s.gross_score >= priorBest) continue;

    await insertEvent(tx, {
      kind: "career_best",
      round_id: round.id,
      player_id: s.player_id,
      guest_name: null,
      data: {
        name: displayNameFor(s),
        is_guest: false,
        gross_score: s.gross_score,
        prior_best: priorBest,
        hole_count: round.hole_count,
        course_name: round.course_name,
      },
      occurred_at: occurredAt,
      dedup_key: `career_best:${round.id}:${s.player_id}`,
    });
  }
}

async function emitFirstSubThresholds(
  tx: DbApi,
  round: RoundRow,
  scores: ScoreRow[],
  occurredAt: string,
): Promise<void> {
  const thresholds =
    round.hole_count === 9 ? SUB_THRESHOLDS_9 : SUB_THRESHOLDS_18;

  for (const s of scores) {
    if (!s.player_id) continue;
    for (const t of thresholds) {
      if (s.gross_score >= t) continue;
      // Was there ever a sub-t round before, same hole_count?
      const earlier = await tx
        .prepare(
          `SELECT 1 AS hit
             FROM scores s2
             JOIN rounds r2 ON r2.id = s2.round_id
            WHERE s2.player_id = ?
              AND r2.hole_count = ?
              AND r2.status = 'final'
              AND r2.id <> ?
              AND s2.gross_score < ?
            LIMIT 1`,
        )
        .get<{ hit: number }>(s.player_id, round.hole_count, round.id, t);
      if (earlier?.hit) continue;

      await insertEvent(tx, {
        kind: "first_sub_threshold",
        round_id: round.id,
        player_id: s.player_id,
        guest_name: null,
        data: {
          name: displayNameFor(s),
          is_guest: false,
          gross_score: s.gross_score,
          threshold: t,
          hole_count: round.hole_count,
          course_name: round.course_name,
        },
        occurred_at: occurredAt,
        dedup_key: `first_sub_threshold:${round.id}:${s.player_id}:${t}`,
      });
    }
  }
}

/** Admin-triggered full backfill — generates events for every round, idempotent. */
export async function backfillFeedEvents(): Promise<{
  rounds_processed: number;
}> {
  const rows = await db
    .prepare(
      `SELECT id FROM rounds
        WHERE status = 'final'
        ORDER BY played_at ASC, id ASC`,
    )
    .all<{ id: number }>();
  let processed = 0;
  for (const r of rows) {
    await generateInner(r.id, db).catch((err) => {
      console.error("[feed-events] backfill round", r.id, err);
    });
    processed += 1;
  }
  return { rounds_processed: processed };
}
