import { NextResponse } from "next/server";
import { db, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { drawRandomCard } from "@/lib/poker";

async function isOrganizer(eventId: number, userId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM event_participants
       WHERE event_id = ? AND user_id = ? AND is_organizer = TRUE`,
    )
    .get<{ ok: number }>(eventId, userId);
  return Boolean(row);
}

type EventRow = {
  id: number;
  course_id: number;
  start_date: string;
  end_date: string;
  status: string;
  total_holes: number;
  second_course_id: number | null;
};

export async function POST(
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

  if (!(await isOrganizer(eventId, me.id))) {
    return NextResponse.json({ error: "Only organizers can start the event" }, { status: 403 });
  }

  const event = await db
    .prepare(
      `SELECT id, course_id, start_date, end_date, status,
              total_holes, second_course_id
       FROM events WHERE id = ?`,
    )
    .get<EventRow>(eventId);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.status === "in_progress" || event.status === "completed" || event.status === "archived") {
    return NextResponse.json(
      { error: "Event has already been started" },
      { status: 409 },
    );
  }

  const players = await db
    .prepare(
      `SELECT user_id FROM event_participants
       WHERE event_id = ? AND role = 'player'`,
    )
    .all<{ user_id: string }>(eventId);
  if (players.length < 2) {
    return NextResponse.json(
      { error: "Need at least 2 players to start" },
      { status: 400 },
    );
  }
  if (players.length > 8) {
    return NextResponse.json({ error: "Max 8 players per event" }, { status: 400 });
  }

  const numDecks = Math.max(1, Math.ceil(players.length / 4));

  await withTransaction(async (tx) => {
    // Status → in_progress
    await tx
      .prepare("UPDATE events SET status = 'in_progress' WHERE id = ?")
      .run(eventId);

    // Create rounds based on event.total_holes:
    //   9  → R1 individual 9
    //   18 → R1 individual 18
    //   36 → R1 individual 18 + R2 scramble 18 (R2 uses second_course_id if set)
    const total = event.total_holes ?? 18;
    if (total === 9) {
      await tx
        .prepare(
          `INSERT INTO rounds
             (course_id, played_at, created_by, event_id, scoring_mode, round_number, round_format, hole_count)
           VALUES (?, ?, ?, ?, 'hole_by_hole', 1, 'individual', 9)`,
        )
        .run(event.course_id, event.start_date, me.id, eventId);
    } else if (total === 36) {
      await tx
        .prepare(
          `INSERT INTO rounds
             (course_id, played_at, created_by, event_id, scoring_mode, round_number, round_format, hole_count)
           VALUES (?, ?, ?, ?, 'hole_by_hole', 1, 'individual', 18)`,
        )
        .run(event.course_id, event.start_date, me.id, eventId);
      const round2Course = event.second_course_id ?? event.course_id;
      await tx
        .prepare(
          `INSERT INTO rounds
             (course_id, played_at, created_by, event_id, scoring_mode, round_number, round_format, hole_count)
           VALUES (?, ?, ?, ?, 'hole_by_hole', 2, 'scramble', 18)`,
        )
        .run(round2Course, event.end_date, me.id, eventId);
    } else {
      // default 18
      await tx
        .prepare(
          `INSERT INTO rounds
             (course_id, played_at, created_by, event_id, scoring_mode, round_number, round_format, hole_count)
           VALUES (?, ?, ?, ?, 'hole_by_hole', 1, 'individual', 18)`,
        )
        .run(event.course_id, event.start_date, me.id, eventId);
    }

    // Seed poker deck state + per-player hand rows for any enabled poker side game.
    const pokerEnabled = await tx
      .prepare(
        "SELECT 1 AS ok FROM side_games WHERE event_id = ? AND kind = 'poker'",
      )
      .get<{ ok: number }>(eventId);

    if (pokerEnabled) {
      // Seed initial community wild from the deck. Birdies/eagles re-roll it.
      const initialWild = drawRandomCard(numDecks, []);
      const initialDrawn = initialWild ? [initialWild] : [];
      await tx
        .prepare(
          `INSERT INTO poker_deck_state (event_id, num_decks, drawn, wild_card)
           VALUES (?, ?, ?::jsonb, ?::jsonb)
           ON CONFLICT (event_id) DO UPDATE
             SET num_decks = EXCLUDED.num_decks,
                 drawn = EXCLUDED.drawn,
                 wild_card = EXCLUDED.wild_card`,
        )
        .run(
          eventId,
          numDecks,
          JSON.stringify(initialDrawn),
          initialWild ? JSON.stringify(initialWild) : null,
        );

      for (const p of players) {
        await tx
          .prepare(
            `INSERT INTO poker_hands (event_id, player_id, cards, wild_count, bogey_count)
             VALUES (?, ?, '[]'::jsonb, 0, 0)
             ON CONFLICT (event_id, player_id) DO NOTHING`,
          )
          .run(eventId, p.user_id);
      }
    }
  });

  return NextResponse.json({ ok: true });
}
