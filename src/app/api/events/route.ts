import { NextResponse } from "next/server";
import { db, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { EventStatus } from "@/lib/types";

type EventRow = {
  id: number;
  name: string;
  course_id: number;
  course_name: string;
  start_date: string;
  end_date: string;
  entry_fee_cents: number;
  description: string | null;
  status: EventStatus;
  exclude_from_leaderboard: boolean;
  created_by: string;
  created_at: string;
  participant_count: number;
};

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await db
    .prepare(
      `SELECT e.id, e.name, e.course_id, c.name AS course_name,
              e.start_date, e.end_date, e.entry_fee_cents, e.description,
              e.status, e.exclude_from_leaderboard, e.created_by, e.created_at,
              COALESCE(p.cnt, 0)::int AS participant_count
       FROM events e
       JOIN courses c ON c.id = e.course_id
       LEFT JOIN (
         SELECT event_id, COUNT(*)::int AS cnt
         FROM event_participants
         WHERE role = 'player'
         GROUP BY event_id
       ) p ON p.event_id = e.id
       ORDER BY e.start_date DESC, e.id DESC`,
    )
    .all<EventRow>();

  return NextResponse.json({ events: rows });
}

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    name?: unknown;
    course_id?: unknown;
    start_date?: unknown;
    end_date?: unknown;
    entry_fee_cents?: unknown;
    description?: unknown;
    exclude_from_leaderboard?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const courseId = Number(body.course_id);
  const startDate = typeof body.start_date === "string" ? body.start_date : "";
  const endDate = typeof body.end_date === "string" ? body.end_date : "";
  const entryFeeCents = Number.isFinite(Number(body.entry_fee_cents))
    ? Math.max(0, Math.round(Number(body.entry_fee_cents)))
    : 0;
  const description =
    typeof body.description === "string" && body.description.trim().length > 0
      ? body.description.trim()
      : null;
  const excludeFromLeaderboard = body.exclude_from_leaderboard === true;

  if (name.length === 0 || name.length > 120) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: "Course is required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return NextResponse.json({ error: "Start and end dates required" }, { status: 400 });
  }
  if (endDate < startDate) {
    return NextResponse.json({ error: "End date must be on or after start date" }, { status: 400 });
  }

  const course = await db
    .prepare("SELECT id FROM courses WHERE id = ?")
    .get<{ id: number }>(courseId);
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const eventId = await withTransaction(async (tx) => {
    const inserted = await tx
      .prepare(
        `INSERT INTO events
           (name, course_id, start_date, end_date, entry_fee_cents,
            description, exclude_from_leaderboard, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
      )
      .get<{ id: number }>(
        name,
        courseId,
        startDate,
        endDate,
        entryFeeCents,
        description,
        excludeFromLeaderboard,
        me.id,
      );
    const id = inserted!.id;
    await tx
      .prepare(
        `INSERT INTO event_participants (event_id, user_id, role, is_organizer)
         VALUES (?, ?, 'player', TRUE)`,
      )
      .run(id, me.id);
    return id;
  });

  return NextResponse.json({ event_id: eventId });
}
