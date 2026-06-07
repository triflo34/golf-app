import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { PokerCard } from "@/lib/types";

// JSONB columns can come back as text strings when the postgres lib is
// configured with prepare:false (which we are, for the pgbouncer pooler).
// Parse defensively.
function asJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}

type HandRowRaw = {
  player_id: string;
  display_name: string;
  cards: unknown;
  wild_count: number;
  bogey_count: number;
};

type SwapRowRaw = {
  id: number;
  player_id: string;
  incoming_card: unknown;
  delta: number;
  resolved_at: string | null;
  created_at: string;
};

type DeckRowRaw = { num_decks: number; drawn: unknown; wild_card: unknown };

function asWild(v: unknown): PokerCard | null {
  if (v == null) return null;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === "object" ? (parsed as PokerCard) : null;
    } catch {
      return null;
    }
  }
  return v as PokerCard;
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

  const enabled = await db
    .prepare(
      "SELECT 1 AS ok FROM side_games WHERE event_id = ? AND kind = 'poker'",
    )
    .get<{ ok: number }>(eventId);
  if (!enabled) {
    return NextResponse.json({
      enabled: false,
      hands: [],
      pending_swaps: [],
      deck: null,
    });
  }

  const handsRaw = await db
    .prepare(
      `SELECT ph.player_id, u.display_name, ph.cards, ph.wild_count, ph.bogey_count
       FROM poker_hands ph JOIN users u ON u.id = ph.player_id
       WHERE ph.event_id = ?
       ORDER BY u.display_name ASC`,
    )
    .all<HandRowRaw>(eventId);

  const swapsRaw = await db
    .prepare(
      `SELECT id, player_id, incoming_card, delta, resolved_at, created_at
       FROM poker_swap_queue
       WHERE event_id = ? AND resolved_at IS NULL
       ORDER BY created_at ASC, id ASC`,
    )
    .all<SwapRowRaw>(eventId);

  const deckRaw = await db
    .prepare(
      "SELECT num_decks, drawn, wild_card FROM poker_deck_state WHERE event_id = ?",
    )
    .get<DeckRowRaw>(eventId);

  // Viewer role + current winner + event status. Hands stay hidden until the
  // event is finished (only your own is face-up before then); judging reveals
  // everyone once the event is completed.
  const [meOrg, winnerRow, eventRow] = await Promise.all([
    db
      .prepare(
        `SELECT 1 AS ok FROM event_participants
         WHERE event_id = ? AND user_id = ? AND is_organizer = TRUE`,
      )
      .get<{ ok: number }>(eventId, me.id),
    db
      .prepare(
        `SELECT r.player_id
         FROM side_game_results r JOIN side_games sg ON sg.id = r.side_game_id
         WHERE sg.event_id = ? AND sg.kind = 'poker' AND r.player_id IS NOT NULL
         ORDER BY r.rank ASC NULLS LAST LIMIT 1`,
      )
      .get<{ player_id: string }>(eventId),
    db.prepare("SELECT status FROM events WHERE id = ?").get<{ status: string }>(eventId),
  ]);
  const eventCompleted =
    eventRow?.status === "completed" || eventRow?.status === "archived";

  const hands = handsRaw.map((h) => ({
    ...h,
    cards: asJson<PokerCard[]>(h.cards, []),
  }));
  const pending_swaps = swapsRaw.map((s) => ({
    ...s,
    incoming_card: asJson<PokerCard | null>(s.incoming_card, null),
  }));
  const deck = deckRaw
    ? {
        num_decks: deckRaw.num_decks,
        drawn: asJson<PokerCard[]>(deckRaw.drawn, []),
        wild_card: asWild(deckRaw.wild_card),
      }
    : null;

  return NextResponse.json({
    enabled: true,
    hands,
    pending_swaps,
    deck,
    viewer_is_organizer: Boolean(meOrg),
    winner_player_id: winnerRow?.player_id ?? null,
    event_completed: eventCompleted,
  });
}
