import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, userId } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }
  if (!userId) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  if (!(await isOrganizer(eventId, me.id))) {
    return NextResponse.json({ error: "Only organizers can remove players" }, { status: 403 });
  }

  const status = await eventStatus(eventId);
  if (status !== "draft" && status !== "open") {
    return NextResponse.json(
      { error: "Roster is locked once the event is In Progress" },
      { status: 409 },
    );
  }

  await db
    .prepare(
      `DELETE FROM event_participants
       WHERE event_id = ? AND user_id = ? AND role = 'player'`,
    )
    .run(eventId, userId);

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, userId } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  if (!(await isOrganizer(eventId, me.id))) {
    return NextResponse.json({ error: "Only organizers can edit participants" }, { status: 403 });
  }

  let body: { group_num?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const groupNum =
    body.group_num == null || body.group_num === ""
      ? null
      : Number(body.group_num);
  if (groupNum != null && (!Number.isInteger(groupNum) || groupNum < 1 || groupNum > 99)) {
    return NextResponse.json({ error: "group_num must be 1–99" }, { status: 400 });
  }

  const result = await db
    .prepare(
      `UPDATE event_participants SET group_num = ?
       WHERE event_id = ? AND user_id = ?`,
    )
    .run(groupNum, eventId, userId);

  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
