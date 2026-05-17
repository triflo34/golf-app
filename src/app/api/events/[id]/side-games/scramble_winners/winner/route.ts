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
    return NextResponse.json({ error: "Only organizers can pick winners" }, { status: 403 });
  }

  let body: { team_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const teamId = body.team_id === null ? null : Number(body.team_id);
  if (teamId !== null && (!Number.isInteger(teamId) || teamId <= 0)) {
    return NextResponse.json({ error: "team_id required" }, { status: 400 });
  }

  const sg = await db
    .prepare(
      `SELECT id, pot_cents FROM side_games
       WHERE event_id = ? AND kind = 'scramble_winners'`,
    )
    .get<{ id: number; pot_cents: number }>(eventId);
  if (!sg) {
    return NextResponse.json(
      { error: "Scramble Winners side game is not enabled" },
      { status: 400 },
    );
  }

  if (teamId !== null) {
    const team = await db
      .prepare(
        `SELECT st.id FROM scramble_teams st
         JOIN rounds r ON r.id = st.round_id
         WHERE st.id = ? AND r.event_id = ? AND r.round_format = 'scramble'`,
      )
      .get<{ id: number }>(teamId, eventId);
    if (!team) {
      return NextResponse.json(
        { error: "Team not found for this event" },
        { status: 404 },
      );
    }
  }

  await withTransaction(async (tx) => {
    await tx
      .prepare("DELETE FROM side_game_results WHERE side_game_id = ?")
      .run(sg.id);
    if (teamId === null) return;
    const members = await tx
      .prepare(
        "SELECT user_id FROM scramble_team_members WHERE team_id = ?",
      )
      .all<{ user_id: string }>(teamId);
    const memberCount = members.length;
    const perMember = memberCount > 0 ? Math.floor(sg.pot_cents / memberCount) : 0;
    for (const m of members) {
      await tx
        .prepare(
          `INSERT INTO side_game_results (side_game_id, player_id, team_id, rank, payout_cents)
           VALUES (?, ?, ?, 1, ?)`,
        )
        .run(sg.id, m.user_id, teamId, perMember);
    }
  });

  return NextResponse.json({ ok: true });
}
