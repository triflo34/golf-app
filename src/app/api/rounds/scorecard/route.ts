import { NextResponse, after } from "next/server";
import { db, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { populateRoundWeather } from "@/lib/weather";
import { ensureCourseHoles } from "@/lib/events";

type PlayerScorecard = {
  player_id?: unknown;
  strokes?: unknown;
};

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    course_id?: unknown;
    played_at?: unknown;
    notes?: unknown;
    hole_count?: unknown;
    nine_played?: unknown;
    players?: unknown;
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

  // nine_played: only meaningful when 9-hole; forced null otherwise.
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

  const rawPlayers = Array.isArray(body.players) ? (body.players as PlayerScorecard[]) : [];
  if (rawPlayers.length === 0) {
    return NextResponse.json({ error: "At least one player is required" }, { status: 400 });
  }
  if (rawPlayers.length > 8) {
    return NextResponse.json({ error: "Max 8 players per round" }, { status: 400 });
  }

  type Parsed = { player_id: string; strokes: number[]; gross: number };
  const parsed: Parsed[] = [];
  const seen = new Set<string>();

  for (const p of rawPlayers) {
    const pid = typeof p.player_id === "string" ? p.player_id.trim() : "";
    if (!pid) {
      return NextResponse.json(
        { error: "Each player must be a registered user (player_id)" },
        { status: 400 },
      );
    }
    if (seen.has(pid)) {
      return NextResponse.json({ error: "Duplicate player in round" }, { status: 400 });
    }
    seen.add(pid);

    if (!Array.isArray(p.strokes) || p.strokes.length !== holeCount) {
      return NextResponse.json(
        { error: `Each player must have exactly ${holeCount} hole scores` },
        { status: 400 },
      );
    }
    const strokes: number[] = [];
    let gross = 0;
    for (let i = 0; i < holeCount; i++) {
      const n = Number(p.strokes[i]);
      if (!Number.isInteger(n) || n < 1 || n > 20) {
        return NextResponse.json(
          { error: `Hole ${i + 1} score must be 1–20` },
          { status: 400 },
        );
      }
      strokes.push(n);
      gross += n;
    }
    parsed.push({ player_id: pid, strokes, gross });
  }

  const courseRow = await db
    .prepare("SELECT id FROM courses WHERE id = ?")
    .get<{ id: number }>(courseId);
  if (!courseRow) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const ids = parsed.map((p) => p.player_id);
  const placeholders = ids.map(() => "?").join(",");
  const found = await db
    .prepare(`SELECT id FROM users WHERE id IN (${placeholders})`)
    .all<{ id: string }>(...ids);
  if (found.length !== ids.length) {
    return NextResponse.json({ error: "Unknown player" }, { status: 400 });
  }

  // Snapshot the course's par/handicap/yardage for each hole at save time, so
  // historical hole_scores stay tied to the conditions that existed when the
  // round was logged — matching the convention used by event scoring.
  const holeMeta = await ensureCourseHoles(courseId);
  const metaByHole = new Map(holeMeta.map((h) => [h.hole_number, h]));

  const roundId = await withTransaction(async (tx) => {
    const inserted = await tx
      .prepare(
        `INSERT INTO rounds (course_id, played_at, created_by, notes, hole_count, nine_played, scoring_mode)
         VALUES (?, ?, ?, ?, ?, ?, 'hole_by_hole')
         RETURNING id`,
      )
      .get<{ id: number }>(courseId, playedAt, me.id, notes, holeCount, ninePlayed);
    const rid = inserted!.id;

    for (const p of parsed) {
      // Aggregate gross score row — what the existing leaderboard reads from.
      await tx
        .prepare(
          `INSERT INTO scores (round_id, player_id, gross_score)
           VALUES (?, ?, ?)`,
        )
        .run(rid, p.player_id, p.gross);

      // Per-hole rows — what the new birdies/pars stats are computed from.
      for (let i = 0; i < holeCount; i++) {
        const meta = metaByHole.get(i + 1);
        await tx
          .prepare(
            `INSERT INTO hole_scores
               (round_id, player_id, hole_number, strokes, par, handicap_index, yardage, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            rid,
            p.player_id,
            i + 1,
            p.strokes[i],
            meta?.par ?? 4,
            meta?.handicap_index ?? null,
            meta?.yardage ?? null,
            me.id,
          );
      }
    }

    return rid;
  });

  after(() => populateRoundWeather(roundId));

  return NextResponse.json({ round_id: roundId });
}
