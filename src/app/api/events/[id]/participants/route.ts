import { NextResponse } from "next/server";
import { db } from "@/lib/db";
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

async function eventStatus(eventId: number): Promise<string | null> {
  const row = await db
    .prepare("SELECT status FROM events WHERE id = ?")
    .get<{ status: string }>(eventId);
  return row?.status ?? null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  if (!(await isOrganizer(eventId, me.id))) {
    return NextResponse.json({ error: "Only organizers can add players" }, { status: 403 });
  }

  const status = await eventStatus(eventId);
  if (status !== "draft" && status !== "open") {
    return NextResponse.json(
      { error: "Roster is locked once the event is In Progress" },
      { status: 409 },
    );
  }

  let body: { user_id?: unknown; group_num?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const userId = typeof body.user_id === "string" ? body.user_id : "";
  const groupNum =
    body.group_num == null || body.group_num === ""
      ? null
      : Number(body.group_num);
  if (!userId) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }
  if (groupNum != null && (!Number.isInteger(groupNum) || groupNum < 1 || groupNum > 99)) {
    return NextResponse.json({ error: "group_num must be 1–99" }, { status: 400 });
  }

  const user = await db
    .prepare("SELECT id FROM users WHERE id = ?")
    .get<{ id: string }>(userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const count = await db
    .prepare(
      `SELECT COUNT(*)::int AS n FROM event_participants
       WHERE event_id = ? AND role = 'player'`,
    )
    .get<{ n: number }>(eventId);
  if ((count?.n ?? 0) >= 8) {
    return NextResponse.json({ error: "Max 8 players per event" }, { status: 409 });
  }

  // Everyone is role='player' now; is_organizer is the additional flag and
  // is preserved on conflict so re-adding doesn't strip organizer rights.
  await db
    .prepare(
      `INSERT INTO event_participants (event_id, user_id, role, group_num)
       VALUES (?, ?, 'player', ?)
       ON CONFLICT (event_id, user_id) DO UPDATE
         SET group_num = EXCLUDED.group_num`,
    )
    .run(eventId, userId, groupNum);

  return NextResponse.json({ ok: true });
}
