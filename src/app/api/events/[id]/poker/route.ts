import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { PokerCard } from "@/lib/types";

type HandRow = {
  player_id: string;
  display_name: string;
  cards: PokerCard[];
  wild_count: number;
  bogey_count: number;
};

type SwapRow = {
  id: number;
  player_id: string;
  incoming_card: PokerCard | null;
  delta: number;
  resolved_at: string | null;
  created_at: string;
};

type DeckRow = { num_decks: number; drawn: PokerCard[] };

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
    return NextResponse.json({ enabled: false });
  }

  const hands = await db
    .prepare(
      `SELECT ph.player_id, u.display_name, ph.cards, ph.wild_count, ph.bogey_count
       FROM poker_hands ph JOIN users u ON u.id = ph.player_id
       WHERE ph.event_id = ?
       ORDER BY u.display_name ASC`,
    )
    .all<HandRow>(eventId);

  const swaps = await db
    .prepare(
      `SELECT id, player_id, incoming_card, delta, resolved_at, created_at
       FROM poker_swap_queue
       WHERE event_id = ? AND resolved_at IS NULL
       ORDER BY created_at ASC, id ASC`,
    )
    .all<SwapRow>(eventId);

  const deck = await db
    .prepare(
      "SELECT num_decks, drawn FROM poker_deck_state WHERE event_id = ?",
    )
    .get<DeckRow>(eventId);

  return NextResponse.json({
    enabled: true,
    hands,
    pending_swaps: swaps,
    deck,
  });
}
