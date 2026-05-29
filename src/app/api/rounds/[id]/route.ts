import { NextResponse, after } from "next/server";
import { db, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { populateRoundWeather } from "@/lib/weather";
import { ensureCourseHoles } from "@/lib/events";

export type RoundWeatherSummary = {
  temp_high_f: number | null;
  temp_low_f: number | null;
  wind_max_mph: number | null;
  precip_in: number | null;
  weather_code: number | null;
};

export type RoundHoleStats = {
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubles_plus: number;
};

export type RoundDetail = {
  id: number;
  course_id: number;
  course_name: string;
  played_at: string;
  notes: string | null;
  hole_count: number;
  /** Which nine was played, only meaningful when hole_count = 9. */
  nine_played: "front" | "back" | null;
  /** "live" means scoring is still in progress — UI should redirect to /rounds/live/[id]. */
  status: "live" | "final";
  created_by: string;
  created_by_name: string;
  can_edit: boolean;
  weather: RoundWeatherSummary | null;
  /** Per-hole pars from the course (length = hole_count). [] if missing. */
  pars: number[];
  scores: {
    id: number;
    player_id: string | null;
    guest_name: string | null;
    name: string;
    username: string | null;
    is_guest: boolean;
    gross_score: number;
    notes: string | null;
    /**
     * Per-hole strokes for this player, length = hole_count. null entry =
     * that hole wasn't recorded. Empty array if no hole-by-hole data was
     * saved for this round (older rounds, guest-only rounds).
     */
    hole_strokes: (number | null)[];
    /** Eagles/birdies/pars/bogeys/doubles+, summed over recorded holes. */
    hole_stats: RoundHoleStats | null;
  }[];
};

type ScoreInput = {
  player_id?: string | null;
  guest_name?: string | null;
  gross_score: number;
  notes?: string | null;
  /** Optional per-hole strokes. Only valid for registered players (NOT guests)
   *  because hole_scores has a NOT NULL FK to users. When present, length must
   *  equal hole_count and gross_score is derived from the sum. */
  strokes?: number[] | null;
};

async function loadRound(
  id: number,
  currentUserId: string,
  isAdmin: boolean,
): Promise<RoundDetail | null> {
  const round = await db
    .prepare(
      `SELECT r.id, r.course_id, r.played_at, r.notes, r.hole_count, r.nine_played,
              r.status, r.created_by,
              r.temp_high_f, r.temp_low_f, r.wind_max_mph, r.precip_in, r.weather_code,
              r.weather_fetched_at,
              c.name as course_name, u.display_name as created_by_name
       FROM rounds r
       JOIN courses c ON c.id = r.course_id
       JOIN users u ON u.id = r.created_by
       WHERE r.id = ?`,
    )
    .get<{
      id: number;
      course_id: number;
      played_at: string;
      notes: string | null;
      hole_count: number;
      nine_played: string | null;
      status: "live" | "final";
      created_by: string;
      temp_high_f: number | null;
      temp_low_f: number | null;
      wind_max_mph: number | null;
      precip_in: number | null;
      weather_code: number | null;
      weather_fetched_at: string | null;
      course_name: string;
      created_by_name: string;
    }>(id);
  if (!round) return null;

  const weather: RoundWeatherSummary | null = round.weather_fetched_at
    ? {
        temp_high_f: round.temp_high_f,
        temp_low_f: round.temp_low_f,
        wind_max_mph: round.wind_max_mph,
        precip_in: round.precip_in,
        weather_code: round.weather_code,
      }
    : null;

  const scoreRows = await db
    .prepare(
      `SELECT s.id, s.player_id, s.guest_name, s.gross_score, s.notes,
              u.display_name, u.username
       FROM scores s
       LEFT JOIN users u ON u.id = s.player_id
       WHERE s.round_id = ?
       ORDER BY s.gross_score ASC`,
    )
    .all<{
      id: number;
      player_id: string | null;
      guest_name: string | null;
      gross_score: number;
      notes: string | null;
      display_name: string | null;
      username: string | null;
    }>(id);

  // Per-hole pars for the course. May be missing for older / unlinked courses;
  // in that case we return an empty array and the UI falls back gracefully.
  const parRows = await db
    .prepare(
      `SELECT hole_number, par FROM course_holes
       WHERE course_id = ? ORDER BY hole_number`,
    )
    .all<{ hole_number: number; par: number }>(round.course_id);
  const pars: number[] = Array<number>(round.hole_count).fill(0);
  for (const r of parRows) {
    if (r.hole_number >= 1 && r.hole_number <= round.hole_count) {
      pars[r.hole_number - 1] = r.par;
    }
  }
  // If we got no par data at all, signal that with an empty array — easier
  // for the UI to detect than an array of zeros.
  const parsOut = parRows.length > 0 ? pars : [];

  // Per-hole strokes keyed by player_id. hole_scores only exists for
  // registered users (it has a NOT NULL FK to users); guests have nothing here.
  const playerIds = scoreRows
    .map((s) => s.player_id)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  const holeByPlayer = new Map<string, Map<number, number>>();
  if (playerIds.length > 0) {
    const placeholders = playerIds.map(() => "?").join(",");
    const hsRows = await db
      .prepare(
        `SELECT player_id, hole_number, strokes
         FROM hole_scores
         WHERE round_id = ? AND player_id IN (${placeholders})`,
      )
      .all<{ player_id: string; hole_number: number; strokes: number }>(
        id,
        ...playerIds,
      );
    for (const r of hsRows) {
      let m = holeByPlayer.get(r.player_id);
      if (!m) {
        m = new Map();
        holeByPlayer.set(r.player_id, m);
      }
      m.set(r.hole_number, r.strokes);
    }
  }

  const ninePlayed: "front" | "back" | null =
    round.nine_played === "front" || round.nine_played === "back"
      ? round.nine_played
      : null;

  return {
    ...round,
    nine_played: ninePlayed,
    weather,
    can_edit: isAdmin || round.created_by === currentUserId,
    pars: parsOut,
    scores: scoreRows.map((s) => {
      const hs = s.player_id ? holeByPlayer.get(s.player_id) : undefined;
      const hole_strokes: (number | null)[] = Array<number | null>(
        round.hole_count,
      ).fill(null);
      if (hs) {
        for (let i = 1; i <= round.hole_count; i++) {
          const v = hs.get(i);
          if (typeof v === "number") hole_strokes[i - 1] = v;
        }
      }
      const stats = hs ? summarizeHoleStats(hole_strokes, pars) : null;
      return {
        id: s.id,
        player_id: s.player_id,
        guest_name: s.guest_name,
        name: s.player_id ? s.display_name ?? "?" : s.guest_name ?? "?",
        username: s.username,
        is_guest: !s.player_id,
        gross_score: s.gross_score,
        notes: s.notes,
        hole_strokes,
        hole_stats: stats,
      };
    }),
  };
}

function summarizeHoleStats(
  strokes: (number | null)[],
  pars: number[],
): RoundHoleStats {
  const out: RoundHoleStats = {
    eagles: 0,
    birdies: 0,
    pars: 0,
    bogeys: 0,
    doubles_plus: 0,
  };
  for (let i = 0; i < strokes.length; i++) {
    const s = strokes[i];
    const par = pars[i];
    if (s == null || !par) continue;
    const diff = s - par;
    if (diff <= -2) out.eagles += 1;
    else if (diff === -1) out.birdies += 1;
    else if (diff === 0) out.pars += 1;
    else if (diff === 1) out.bogeys += 1;
    else out.doubles_plus += 1;
  }
  return out;
}

function validateScores(rawScores: unknown, holeCount: number):
  | { ok: true; scores: ScoreInput[] }
  | { ok: false; error: string } {
  if (!Array.isArray(rawScores) || rawScores.length === 0) {
    return { ok: false, error: "At least one player is required" };
  }
  if (rawScores.length > 8) {
    return { ok: false, error: "Max 8 players per round" };
  }

  const minScore = holeCount === 9 ? 9 : 18;
  const out: ScoreInput[] = [];
  const seenPlayer = new Set<string>();
  const seenGuest = new Set<string>();
  for (const s of rawScores as Record<string, unknown>[]) {
    const pid =
      typeof s.player_id === "string" && s.player_id.length > 0 ? s.player_id : null;
    const guest =
      typeof s.guest_name === "string" && s.guest_name.trim().length > 0
        ? s.guest_name.trim()
        : null;
    if ((pid && guest) || (!pid && !guest)) {
      return { ok: false, error: "Each score must have a registered player or guest name" };
    }
    if (pid) {
      if (seenPlayer.has(pid)) return { ok: false, error: "Duplicate player in round" };
      seenPlayer.add(pid);
    } else if (guest) {
      const k = guest.toLowerCase();
      if (seenGuest.has(k)) return { ok: false, error: "Duplicate guest name in round" };
      seenGuest.add(k);
    }

    // Optional per-hole strokes. Only allowed for registered players because
    // hole_scores has a NOT NULL FK to users. When provided, gross is derived
    // from the sum so the two stay in sync.
    let strokes: number[] | null = null;
    if (Array.isArray(s.strokes)) {
      if (!pid) {
        return { ok: false, error: "Per-hole strokes are only supported for registered players" };
      }
      if (s.strokes.length !== holeCount) {
        return { ok: false, error: `Per-hole strokes must have ${holeCount} entries` };
      }
      const parsed: number[] = [];
      for (let i = 0; i < holeCount; i++) {
        const v = Number((s.strokes as unknown[])[i]);
        if (!Number.isInteger(v) || v < 1 || v > 20) {
          return { ok: false, error: `Hole ${i + 1} stroke must be 1–20` };
        }
        parsed.push(v);
      }
      strokes = parsed;
    }

    // If strokes are present, derive gross from the sum. Otherwise validate
    // the caller-supplied gross_score as before.
    let gross: number;
    if (strokes) {
      gross = strokes.reduce((a, b) => a + b, 0);
    } else {
      const g = Number(s.gross_score);
      if (!Number.isFinite(g) || g < minScore || g > 200) {
        return { ok: false, error: `Score must be ${minScore}–200` };
      }
      gross = Math.round(g);
    }

    out.push({
      player_id: pid,
      guest_name: guest,
      gross_score: gross,
      notes:
        typeof s.notes === "string" && s.notes.trim().length > 0 ? s.notes.trim() : null,
      strokes,
    });
  }
  return { ok: true, scores: out };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }
  const round = await loadRound(id, me.id, me.is_admin);
  if (!round) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(round);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const existing = await db
    .prepare("SELECT created_by, course_id, played_at FROM rounds WHERE id = ?")
    .get<{ created_by: string; course_id: number; played_at: string }>(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!me.is_admin && existing.created_by !== me.id) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  let body: {
    course_id?: unknown;
    played_at?: unknown;
    notes?: unknown;
    hole_count?: unknown;
    nine_played?: unknown;
    scores?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const courseId = Number(body.course_id);
  const playedAt = typeof body.played_at === "string" ? body.played_at : "";
  const notes =
    typeof body.notes === "string" && body.notes.trim().length > 0
      ? body.notes.trim()
      : null;
  const holeCount = Number(body.hole_count);

  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: "Course is required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(playedAt)) {
    return NextResponse.json({ error: "Date is required" }, { status: 400 });
  }
  if (holeCount !== 9 && holeCount !== 18) {
    return NextResponse.json({ error: "hole_count must be 9 or 18" }, { status: 400 });
  }

  // nine_played: only meaningful when 9-hole; forced null otherwise so we
  // don't carry stale "back"/"front" values from a previous 18-hole save.
  let ninePlayed: "front" | "back" | null = null;
  if (holeCount === 9) {
    if (body.nine_played === "front" || body.nine_played === "back") {
      ninePlayed = body.nine_played;
    } else if (body.nine_played != null) {
      return NextResponse.json(
        { error: "nine_played must be 'front' or 'back'" },
        { status: 400 },
      );
    }
  }

  const v = validateScores(body.scores, holeCount);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const courseRow = await db
    .prepare("SELECT id FROM courses WHERE id = ?")
    .get<{ id: number }>(courseId);
  if (!courseRow) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  if (v.scores.some((s) => s.player_id)) {
    const ids = v.scores.map((s) => s.player_id).filter(Boolean) as string[];
    const placeholders = ids.map(() => "?").join(",");
    const found = await db
      .prepare(`SELECT id FROM users WHERE id IN (${placeholders})`)
      .all<{ id: string }>(...ids);
    if (found.length !== ids.length) {
      return NextResponse.json({ error: "Unknown player" }, { status: 400 });
    }
  }

  const weatherStale =
    existing.course_id !== courseId || existing.played_at !== playedAt;

  // If ANY score has strokes, this is a "hole-by-hole" save and we need the
  // course's per-hole pars/handicap/yardage snapshot so hole_scores can record
  // them at save time (matching the create-via-scorecard flow).
  const anyStrokes = v.scores.some((s) => s.strokes);
  const holeMeta = anyStrokes ? await ensureCourseHoles(courseId) : [];
  const metaByHole = new Map(holeMeta.map((h) => [h.hole_number, h]));

  await withTransaction(async (tx) => {
    await tx
      .prepare(
        `UPDATE rounds SET course_id = ?, played_at = ?, notes = ?, hole_count = ?, nine_played = ? WHERE id = ?`,
      )
      .run(courseId, playedAt, notes, holeCount, ninePlayed, id);
    if (weatherStale) {
      await tx
        .prepare(
          `UPDATE rounds
           SET temp_high_f = NULL, temp_low_f = NULL, wind_max_mph = NULL,
               precip_in = NULL, weather_code = NULL, weather_fetched_at = NULL
           WHERE id = ?`,
        )
        .run(id);
    }
    await tx.prepare("DELETE FROM scores WHERE round_id = ?").run(id);
    // Rebuild hole_scores from scratch only for the players whose scores
    // arrived with strokes. Players without strokes keep gross-only behavior
    // and their old hole_scores rows are wiped (they no longer have a valid
    // gross_score row to reference anyway, since scores rows are recreated).
    await tx.prepare("DELETE FROM hole_scores WHERE round_id = ?").run(id);
    for (const s of v.scores) {
      await tx
        .prepare(
          `INSERT INTO scores (round_id, player_id, guest_name, gross_score, notes)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(id, s.player_id ?? null, s.guest_name ?? null, s.gross_score, s.notes ?? null);
      if (s.strokes && s.player_id) {
        for (let i = 0; i < s.strokes.length; i++) {
          const meta = metaByHole.get(i + 1);
          await tx
            .prepare(
              `INSERT INTO hole_scores
                 (round_id, player_id, hole_number, strokes, par, handicap_index, yardage, updated_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              id,
              s.player_id,
              i + 1,
              s.strokes[i],
              meta?.par ?? 4,
              meta?.handicap_index ?? null,
              meta?.yardage ?? null,
              me.id,
            );
        }
      }
    }
  });

  if (weatherStale) {
    after(() => populateRoundWeather(id));
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }
  const existing = await db
    .prepare("SELECT created_by FROM rounds WHERE id = ?")
    .get<{ created_by: string }>(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!me.is_admin && existing.created_by !== me.id) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  await db.prepare("DELETE FROM rounds WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
