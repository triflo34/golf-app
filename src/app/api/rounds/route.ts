import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

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
  const rawScores = Array.isArray(body.scores) ? body.scores : [];

  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: "Course is required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(playedAt)) {
    return NextResponse.json({ error: "Date is required" }, { status: 400 });
  }
  if (rawScores.length === 0) {
    return NextResponse.json({ error: "At least one player is required" }, { status: 400 });
  }
  if (rawScores.length > 8) {
    return NextResponse.json({ error: "Max 8 players per round" }, { status: 400 });
  }

  const scores: ScoreInput[] = [];
  const seenPlayer = new Set<string>();
  const seenGuest = new Set<string>();

  for (const s of rawScores as Record<string, unknown>[]) {
    const gross = Number(s.gross_score);
    if (!Number.isFinite(gross) || gross < 18 || gross > 200) {
      return NextResponse.json({ error: "Invalid score (must be 18–200)" }, { status: 400 });
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

  const courseRow = db.prepare("SELECT id FROM courses WHERE id = ?").get(courseId);
  if (!courseRow) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  if (scores.some((s) => s.player_id)) {
    const ids = scores.map((s) => s.player_id).filter(Boolean) as string[];
    const placeholders = ids.map(() => "?").join(",");
    const found = db
      .prepare(`SELECT id FROM users WHERE id IN (${placeholders})`)
      .all(...ids) as { id: string }[];
    if (found.length !== ids.length) {
      return NextResponse.json({ error: "Unknown player" }, { status: 400 });
    }
  }

  const insertRound = db.prepare(
    `INSERT INTO rounds (course_id, played_at, created_by, notes)
     VALUES (?, ?, ?, ?)`,
  );
  const insertScore = db.prepare(
    `INSERT INTO scores (round_id, player_id, guest_name, gross_score, notes)
     VALUES (?, ?, ?, ?, ?)`,
  );

  const tx = db.transaction(() => {
    const info = insertRound.run(courseId, playedAt, me.id, notes);
    const roundId = info.lastInsertRowid as number;
    for (const s of scores) {
      insertScore.run(roundId, s.player_id, s.guest_name, s.gross_score, s.notes);
    }
    return roundId;
  });

  const roundId = tx();
  return NextResponse.json({ round_id: roundId });
}
