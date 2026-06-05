import { NextResponse } from "next/server";
import { db, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

async function isOrganizer(eventId: number, userId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM event_participants
       WHERE event_id = ? AND user_id = ? AND is_organizer = TRUE`,
    )
    .get<{ ok: number }>(eventId, userId);
  return Boolean(row);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId)) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  if (!(await isOrganizer(eventId, me.id))) {
    return NextResponse.json(
      { error: "Only organizers can pick winners" },
      { status: 403 },
    );
  }

  let body: { player_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  // null clears the winner; otherwise expect a non-empty player id string.
  const playerId =
    body.player_id === null ? null : String(body.player_id ?? "").trim();
  if (playerId !== null && playerId.length === 0) {
    return NextResponse.json({ error: "player_id required" }, { status: 400 });
  }

  const sg = await db
    .prepare(
      `SELECT id, pot_cents FROM side_games
       WHERE event_id = ? AND kind = 'poker'`,
    )
    .get<{ id: number; pot_cents: number }>(eventId);
  if (!sg) {
    return NextResponse.json(
      { error: "Poker side game is not enabled" },
      { status: 400 },
    );
  }

  if (playerId !== null) {
    const player = await db
      .prepare(
        `SELECT 1 AS ok FROM event_participants
         WHERE event_id = ? AND user_id = ? AND role = 'player'`,
      )
      .get<{ ok: number }>(eventId, playerId);
    if (!player) {
      return NextResponse.json(
        { error: "Player not found in this event" },
        { status: 404 },
      );
    }
  }

  await withTransaction(async (tx) => {
    await tx
      .prepare("DELETE FROM side_game_results WHERE side_game_id = ?")
      .run(sg.id);
    if (playerId === null) return;
    await tx
      .prepare(
        `INSERT INTO side_game_results (side_game_id, player_id, team_id, rank, payout_cents)
         VALUES (?, ?, NULL, 1, ?)`,
      )
      .run(sg.id, playerId, sg.pot_cents);
  });

  return NextResponse.json({ ok: true });
}
