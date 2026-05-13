import { NextResponse, after } from "next/server";
import { db, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { populateRoundWeather } from "@/lib/weather";

type ScoreInput = {
  player_id?: string | null;
  guest_name?: string | null;
  gross_score: number;
  notes?: string | null;
};

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    course_id?: unknown;
    played_at?: unknown;
    notes?: unknown;
    hole_count?: unknown;
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
  const rawScores = Array.isArray(body.scores) ? body.scores : [];

  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: "Course is required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(playedAt)) {
    return NextResponse.json({ error: "Date is required" }, { status: 400 });
  }
  if (holeCount !== 9 && holeCount !== 18) {
    return NextResponse.json({ error: "hole_count must be 9 or 18" }, { status: 400 });
  }
  if (rawScores.length === 0) {
    return NextResponse.json({ error: "At least one player is required" }, { status: 400 });
  }
  if (rawScores.length > 8) {
    return NextResponse.json({ error: "Max 8 players per round" }, { status: 400 });
  }

  const minScore = holeCount === 9 ? 9 : 18;
  const scores: ScoreInput[] = [];
  const seenPlayer = new Set<string>();
  const seenGuest = new Set<string>();

  for (const s of rawScores as Record<string, unknown>[]) {
    const gross = Number(s.gross_score);
    if (!Number.isFinite(gross) || gross < minScore || gross > 200) {
      return NextResponse.json(
        { error: `Invalid score (must be ${minScore}–200)` },
        { status: 400 },
      );
    }
    const pid = typeof s.player_id === "string" && s.player_id.length > 0 ? s.player_id : null;
    const guest =
      typeof s.guest_name === "string" && s.guest_name.trim().length > 0
        ? s.guest_name.trim()
        : null;
    if ((pid && guest) || (!pid && !guest)) {
      return NextResponse.json(
        { error: "Each score must have a registered player or guest name" },
        { status: 400 },
      );
    }
    if (pid) {
      if (seenPlayer.has(pid)) {
        return NextResponse.json({ error: "Duplicate player in round" }, { status: 400 });
      }
      seenPlayer.add(pid);
    } else if (guest) {
      const key = guest.toLowerCase();
      if (seenGuest.has(key)) {
        return NextResponse.json({ error: "Duplicate guest name in round" }, { status: 400 });
      }
      seenGuest.add(key);
    }
    scores.push({
      player_id: pid,
      guest_name: guest,
      gross_score: Math.round(gross),
      notes:
        typeof s.notes === "string" && s.notes.trim().length > 0 ? s.notes.trim() : null,
    });
  }

  const courseRow = await db
    .prepare("SELECT id FROM courses WHERE id = ?")
    .get<{ id: number }>(courseId);
  if (!courseRow) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  if (scores.some((s) => s.player_id)) {
    const ids = scores.map((s) => s.player_id).filter(Boolean) as string[];
    const placeholders = ids.map(() => "?").join(",");
    const found = await db
      .prepare(`SELECT id FROM users WHERE id IN (${placeholders})`)
      .all<{ id: string }>(...ids);
    if (found.length !== ids.length) {
      return NextResponse.json({ error: "Unknown player" }, { status: 400 });
    }
  }

  const roundId = await withTransaction(async (tx) => {
    const inserted = await tx
      .prepare(
        `INSERT INTO rounds (course_id, played_at, created_by, notes, hole_count)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id`,
      )
      .get<{ id: number }>(courseId, playedAt, me.id, notes, holeCount);
    const rid = inserted!.id;
    for (const s of scores) {
      await tx
        .prepare(
          `INSERT INTO scores (round_id, player_id, guest_name, gross_score, notes)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(rid, s.player_id ?? null, s.guest_name ?? null, s.gross_score, s.notes ?? null);
    }
    return rid;
  });

  after(() => populateRoundWeather(roundId));

  return NextResponse.json({ round_id: roundId });
}
