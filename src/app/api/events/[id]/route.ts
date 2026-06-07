import { NextResponse } from "next/server";
import { db, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { EventStatus } from "@/lib/types";

type EventDetailRow = {
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
};

type ParticipantRow = {
  user_id: string;
  role: "organizer" | "player";
  is_organizer: boolean;
  group_num: number | null;
  seq: number;
  display_name: string;
  username: string;
};

type RoundRow = {
  id: number;
  round_number: number;
  round_format: "individual" | "scramble";
  hole_count: number;
  played_at: string;
};

async function loadEvent(eventId: number) {
  const event = await db
    .prepare(
      `SELECT e.id, e.name, e.course_id, c.name AS course_name,
              e.start_date, e.end_date, e.entry_fee_cents, e.description,
              e.status, e.exclude_from_leaderboard, e.created_by, e.created_at
       FROM events e JOIN courses c ON c.id = e.course_id
       WHERE e.id = ?`,
    )
    .get<EventDetailRow>(eventId);
  if (!event) return null;
  const participants = await db
    .prepare(
      `SELECT ep.user_id, ep.role, ep.is_organizer, ep.group_num, ep.seq,
              u.display_name, u.username
       FROM event_participants ep JOIN users u ON u.id = ep.user_id
       WHERE ep.event_id = ?
       ORDER BY ep.seq ASC, u.display_name ASC`,
    )
    .all<ParticipantRow>(eventId);
  const rounds = await db
    .prepare(
      `SELECT id, round_number, round_format, hole_count, played_at
       FROM rounds WHERE event_id = ?
       ORDER BY round_number ASC, id ASC`,
    )
    .all<RoundRow>(eventId);
  return { event, participants, rounds };
}

async function isOrganizer(eventId: number, userId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM event_participants
       WHERE event_id = ? AND user_id = ? AND is_organizer = TRUE`,
    )
    .get<{ ok: number }>(eventId, userId);
  return Boolean(row);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  const result = await loadEvent(eventId);
  if (!result) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  return NextResponse.json(result);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  const allowed = me.is_admin || (await isOrganizer(eventId, me.id));
  if (!allowed) {
    return NextResponse.json(
      { error: "Only organizers or admins can delete events" },
      { status: 403 },
    );
  }

  // events.id is referenced by rounds.event_id with ON DELETE SET NULL.
  // Delete the rounds explicitly so the per-hole + score-edit cascades fire.
  await db.prepare("DELETE FROM rounds WHERE event_id = ?").run(eventId);
  const result = await db.prepare("DELETE FROM events WHERE id = ?").run(eventId);

  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(
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
    return NextResponse.json({ error: "Only organizers can update events" }, { status: 403 });
  }

  const current = await db
    .prepare("SELECT status, exclude_from_leaderboard FROM events WHERE id = ?")
    .get<{ status: EventStatus; exclude_from_leaderboard: boolean }>(eventId);
  if (!current) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const updates: string[] = [];
  const args: (string | number | boolean | null)[] = [];

  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (n.length === 0 || n.length > 120) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }
    updates.push("name = ?");
    args.push(n);
  }
  if (typeof body.description === "string" || body.description === null) {
    updates.push("description = ?");
    args.push(body.description === null ? null : String(body.description).trim() || null);
  }
  if (typeof body.entry_fee_cents === "number") {
    updates.push("entry_fee_cents = ?");
    args.push(Math.max(0, Math.round(body.entry_fee_cents)));
  }
  if (typeof body.exclude_from_leaderboard === "boolean") {
    updates.push("exclude_from_leaderboard = ?");
    args.push(body.exclude_from_leaderboard);
  }
  if (typeof body.status === "string") {
    const allowed: EventStatus[] = ["draft", "open", "in_progress", "completed", "archived"];
    if (!allowed.includes(body.status as EventStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    updates.push("status = ?");
    args.push(body.status);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Resulting leaderboard-exclusion + status after this update.
  const nextExclude =
    typeof body.exclude_from_leaderboard === "boolean"
      ? body.exclude_from_leaderboard
      : current.exclude_from_leaderboard;
  const statusAfter =
    typeof body.status === "string" ? (body.status as EventStatus) : current.status;
  // Materialize whenever the event is completed after this update — not only on
  // the transition — so an already-completed event gets backfilled the next time
  // it's touched (e.g. toggling its "count in stats" flag). Rebuild is idempotent.
  const completedAfter = statusAfter === "completed";

  args.push(eventId);
  await withTransaction(async (tx) => {
    await tx
      .prepare(`UPDATE events SET ${updates.join(", ")} WHERE id = ?`)
      .run(...args);

    // The season leaderboard/profile stats read the gross `scores` table and
    // filter on `rounds.excluded` — neither of which events touch during play.
    // So on completion we roll each individual round's per-hole scores up into
    // a gross `scores` row, and keep `rounds.excluded` in sync with the event's
    // "count in stats" flag (also when that flag is toggled on its own).
    if (completedAfter) {
      const rounds = await tx
        .prepare(
          `SELECT id FROM rounds WHERE event_id = ? AND round_format = 'individual'`,
        )
        .all<{ id: number }>(eventId);
      for (const r of rounds) {
        const totals = await tx
          .prepare(
            `SELECT player_id, SUM(strokes)::int AS total
               FROM hole_scores
              WHERE round_id = ? AND player_id IS NOT NULL
              GROUP BY player_id`,
          )
          .all<{ player_id: string; total: number }>(r.id);
        // Rebuild from scratch so re-completing after score edits stays correct.
        await tx.prepare("DELETE FROM scores WHERE round_id = ?").run(r.id);
        for (const t of totals) {
          await tx
            .prepare(
              `INSERT INTO scores (round_id, player_id, gross_score) VALUES (?, ?, ?)`,
            )
            .run(r.id, t.player_id, t.total);
        }
      }
    }

    if (completedAfter || typeof body.exclude_from_leaderboard === "boolean") {
      await tx
        .prepare(`UPDATE rounds SET excluded = ? WHERE event_id = ?`)
        .run(nextExclude, eventId);
    }
  });

  const fresh = await loadEvent(eventId);
  return NextResponse.json(fresh);
}
