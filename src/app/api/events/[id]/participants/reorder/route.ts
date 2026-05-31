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

export async function PUT(
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
    return NextResponse.json(
      { error: "Only organizers can reorder players" },
      { status: 403 },
    );
  }

  let body: { user_ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!Array.isArray(body.user_ids) || body.user_ids.length === 0) {
    return NextResponse.json(
      { error: "user_ids must be a non-empty array" },
      { status: 400 },
    );
  }
  const ids = body.user_ids.map((v) => String(v));
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "Duplicate user_ids" }, { status: 400 });
  }

  // Confirm every id belongs to this event so the org can't reorder strangers.
  const placeholders = ids.map(() => "?").join(",");
  const found = await db
    .prepare(
      `SELECT user_id FROM event_participants
       WHERE event_id = ? AND user_id IN (${placeholders})`,
    )
    .all<{ user_id: string }>(eventId, ...ids);
  if (found.length !== ids.length) {
    return NextResponse.json(
      { error: "Some user_ids are not in this event" },
      { status: 400 },
    );
  }

  await withTransaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx
        .prepare(
          `UPDATE event_participants SET seq = ?
           WHERE event_id = ? AND user_id = ?`,
        )
        .run(i + 1, eventId, ids[i]);
    }
  });

  return NextResponse.json({ ok: true });
}
