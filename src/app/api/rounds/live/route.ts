import { NextResponse } from "next/server";
import { db, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

type PlayerInput = {
  player_id?: string | null;
  guest_name?: string | null;
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
  const ninePlayed: "front" | "back" | null =
    body.nine_played === "front" || body.nine_played === "back"
      ? body.nine_played
      : null;

  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: "Course is required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(playedAt)) {
    return NextResponse.json({ error: "Date is required" }, { status: 400 });
  }
  if (holeCount !== 9 && holeCount !== 18) {
    return NextResponse.json(
      { error: "hole_count must be 9 or 18" },
      { status: 400 },
    );
  }
  const ninePlayedToStore = holeCount === 9 ? ninePlayed : null;

  const rawPlayers = Array.isArray(body.players)
    ? (body.players as PlayerInput[])
    : [];
  if (rawPlayers.length === 0) {
    return NextResponse.json(
      { error: "At least one player is required" },
      { status: 400 },
    );
  }
  if (rawPlayers.length > 8) {
    return NextResponse.json({ error: "Max 8 players per round" }, { status: 400 });
  }

  type Parsed = { player_id: string | null; guest_name: string | null };
  const parsed: Parsed[] = [];
  const seenPlayer = new Set<string>();
  const seenGuest = new Set<string>();

  for (const p of rawPlayers) {
    const pid =
      typeof p.player_id === "string" && p.player_id.length > 0
        ? p.player_id
        : null;
    const guest =
      typeof p.guest_name === "string" && p.guest_name.trim().length > 0
        ? p.guest_name.trim()
        : null;
    if ((pid && guest) || (!pid && !guest)) {
      return NextResponse.json(
        { error: "Each player must be a registered user or a guest name" },
        { status: 400 },
      );
    }
    if (pid) {
      if (seenPlayer.has(pid)) {
        return NextResponse.json(
          { error: "Duplicate player in round" },
          { status: 400 },
        );
      }
      seenPlayer.add(pid);
    } else if (guest) {
      const key = guest.toLowerCase();
      if (seenGuest.has(key)) {
        return NextResponse.json(
          { error: "Duplicate guest name in round" },
          { status: 400 },
        );
      }
      seenGuest.add(key);
    }
    parsed.push({ player_id: pid, guest_name: guest });
  }

  const courseRow = await db
    .prepare("SELECT id FROM courses WHERE id = ?")
    .get<{ id: number }>(courseId);
  if (!courseRow) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const registeredIds = parsed
    .map((p) => p.player_id)
    .filter((x): x is string => Boolean(x));
  if (registeredIds.length > 0) {
    const placeholders = registeredIds.map(() => "?").join(",");
    const found = await db
      .prepare(`SELECT id FROM users WHERE id IN (${placeholders})`)
      .all<{ id: string }>(...registeredIds);
    if (found.length !== registeredIds.length) {
      return NextResponse.json({ error: "Unknown player" }, { status: 400 });
    }
  }

  const roundId = await withTransaction(async (tx) => {
    const inserted = await tx
      .prepare(
        `INSERT INTO rounds (course_id, played_at, created_by, notes, hole_count, nine_played, scoring_mode, status)
         VALUES (?, ?, ?, ?, ?, ?, 'hole_by_hole', 'live')
         RETURNING id`,
      )
      .get<{ id: number }>(
        courseId,
        playedAt,
        me.id,
        notes,
        holeCount,
        ninePlayedToStore,
      );
    const rid = inserted!.id;

    for (let i = 0; i < parsed.length; i++) {
      const p = parsed[i];
      await tx
        .prepare(
          `INSERT INTO round_players (round_id, player_id, guest_name, seq)
           VALUES (?, ?, ?, ?)`,
        )
        .run(rid, p.player_id, p.guest_name, i);
    }
    return rid;
  });

  return NextResponse.json({ round_id: roundId });
}
