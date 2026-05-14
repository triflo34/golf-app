import { NextResponse } from "next/server";
import { db, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

type TeamRow = {
  id: number;
  round_id: number;
  name: string;
};

type MemberRow = {
  team_id: number;
  user_id: string;
  display_name: string;
};

async function isOrganizer(eventId: number, userId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM event_participants
       WHERE event_id = ? AND user_id = ? AND role = 'organizer'`,
    )
    .get<{ ok: number }>(eventId, userId);
  return Boolean(row);
}

async function eventStatus(eventId: number): Promise<string | null> {
  const row = await db
    .prepare("SELECT status FROM events WHERE id = ?")
    .get<{ status: string }>(eventId);
  return row?.status ?? null;
}

async function getScrambleRound(eventId: number): Promise<{ id: number } | null> {
  return (
    (await db
      .prepare(
        `SELECT id FROM rounds
         WHERE event_id = ? AND round_format = 'scramble'
         ORDER BY round_number ASC LIMIT 1`,
      )
      .get<{ id: number }>(eventId)) ?? null
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId)) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  const round = await getScrambleRound(eventId);
  if (!round) {
    return NextResponse.json({ teams: [], round_id: null });
  }

  const teams = await db
    .prepare(
      `SELECT id, round_id, name FROM scramble_teams
       WHERE round_id = ? ORDER BY id ASC`,
    )
    .all<TeamRow>(round.id);

  if (teams.length === 0) {
    return NextResponse.json({ teams: [], round_id: round.id });
  }

  const teamIds = teams.map((t) => t.id);
  const placeholders = teamIds.map(() => "?").join(",");
  const members = await db
    .prepare(
      `SELECT m.team_id, m.user_id, u.display_name
       FROM scramble_team_members m JOIN users u ON u.id = m.user_id
       WHERE m.team_id IN (${placeholders})
       ORDER BY u.display_name ASC`,
    )
    .all<MemberRow>(...teamIds);

  const membersByTeam = new Map<number, MemberRow[]>();
  for (const m of members) {
    if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, []);
    membersByTeam.get(m.team_id)!.push(m);
  }

  return NextResponse.json({
    round_id: round.id,
    teams: teams.map((t) => ({
      ...t,
      members: membersByTeam.get(t.id) ?? [],
    })),
  });
}

export async function PUT(
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
    return NextResponse.json({ error: "Only organizers can edit teams" }, { status: 403 });
  }

  const status = await eventStatus(eventId);
  if (status === "completed" || status === "archived") {
    return NextResponse.json(
      { error: "Event is completed; teams can no longer be edited" },
      { status: 409 },
    );
  }

  const round = await getScrambleRound(eventId);
  if (!round) {
    return NextResponse.json(
      { error: "No scramble round exists for this event" },
      { status: 404 },
    );
  }

  let body: { teams?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!Array.isArray(body.teams)) {
    return NextResponse.json({ error: "teams array required" }, { status: 400 });
  }

  type Input = { name: string; member_ids: string[] };
  const inputs: Input[] = [];
  const seenMembers = new Set<string>();
  for (const raw of body.teams as Record<string, unknown>[]) {
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Team name required" }, { status: 400 });
    const members = Array.isArray(raw.member_ids) ? raw.member_ids : [];
    if (members.length === 0) {
      return NextResponse.json({ error: `Team "${name}" has no members` }, { status: 400 });
    }
    const memberIds: string[] = [];
    for (const m of members) {
      if (typeof m !== "string" || !m) {
        return NextResponse.json({ error: "Invalid member id" }, { status: 400 });
      }
      if (seenMembers.has(m)) {
        return NextResponse.json(
          { error: "Each player can only be on one team" },
          { status: 400 },
        );
      }
      seenMembers.add(m);
      memberIds.push(m);
    }
    inputs.push({ name, member_ids: memberIds });
  }

  // Verify all members are players in this event.
  if (seenMembers.size > 0) {
    const ids = Array.from(seenMembers);
    const placeholders = ids.map(() => "?").join(",");
    const found = await db
      .prepare(
        `SELECT user_id FROM event_participants
         WHERE event_id = ? AND role = 'player' AND user_id IN (${placeholders})`,
      )
      .all<{ user_id: string }>(eventId, ...ids);
    if (found.length !== ids.length) {
      return NextResponse.json(
        { error: "All team members must be event players" },
        { status: 400 },
      );
    }
  }

  await withTransaction(async (tx) => {
    // Replace all teams for this round.
    await tx
      .prepare("DELETE FROM scramble_teams WHERE round_id = ?")
      .run(round.id);
    for (const t of inputs) {
      const inserted = await tx
        .prepare(
          `INSERT INTO scramble_teams (round_id, name) VALUES (?, ?) RETURNING id`,
        )
        .get<{ id: number }>(round.id, t.name);
      for (const uid of t.member_ids) {
        await tx
          .prepare(
            `INSERT INTO scramble_team_members (team_id, user_id) VALUES (?, ?)`,
          )
          .run(inserted!.id, uid);
      }
    }
  });

  return NextResponse.json({ ok: true });
}
