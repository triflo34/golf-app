import { NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { PokerCard } from "@/lib/types";

type SwapRow = {
  id: number;
  event_id: number;
  player_id: string;
  incoming_card: PokerCard | null;
  delta: number;
  resolved_at: string | null;
};

type HandRow = {
  cards: unknown;
};

const MAX_HAND = 5;

// JSONB returns as a string under prepare:false (pgbouncer pooler).
function asCards(v: unknown): PokerCard[] {
  if (Array.isArray(v)) return v as PokerCard[];
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? (parsed as PokerCard[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asIncoming(v: unknown): PokerCard | null {
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; swapId: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, swapId } = await params;
  const eventId = Number(id);
  const sid = Number(swapId);
  if (!Number.isInteger(eventId) || !Number.isInteger(sid)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: { action?: unknown; discard_index?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // action: "swap" (replace card at discard_index with incoming_card),
  //         "skip" (discard incoming card — only valid when incoming_card present),
  //         "discard" (remove card at discard_index — only valid when delta < 0)
  const action = typeof body.action === "string" ? body.action : "";
  const discardIndex =
    body.discard_index == null ? null : Number(body.discard_index);

  try {
    await withTransaction(async (tx) => {
    const swap = await tx
      .prepare(
        `SELECT id, event_id, player_id, incoming_card, delta, resolved_at
         FROM poker_swap_queue WHERE id = ? AND event_id = ?
         FOR UPDATE`,
      )
      .get<SwapRow>(sid, eventId);
    if (!swap) throw new Error("Swap not found");
    if (swap.resolved_at) throw new Error("Swap already resolved");

    const handRaw = await tx
      .prepare(
        `SELECT cards FROM poker_hands WHERE event_id = ? AND player_id = ?`,
      )
      .get<HandRow>(eventId, swap.player_id);
    if (!handRaw) throw new Error("Player hand not found");

    const currentCards = asCards(handRaw.cards);
    const incomingCard = asIncoming(swap.incoming_card);
    let nextCards = [...currentCards];
    let swappedCard: PokerCard | null = null;

    if (incomingCard && action === "swap") {
      if (
        discardIndex == null ||
        !Number.isInteger(discardIndex) ||
        discardIndex < 0 ||
        discardIndex >= nextCards.length
      ) {
        throw new Error("discard_index out of range");
      }
      swappedCard = nextCards[discardIndex];
      nextCards[discardIndex] = incomingCard;
    } else if (incomingCard && action === "skip") {
      swappedCard = incomingCard; // we're discarding the new one
      // Hand unchanged. The incoming card stays in deck.drawn (the deck doesn't get cards back —
      // shared-deck semantics: once drawn, always drawn).
    } else if (swap.delta < 0 && action === "discard") {
      if (
        discardIndex == null ||
        !Number.isInteger(discardIndex) ||
        discardIndex < 0 ||
        discardIndex >= nextCards.length
      ) {
        throw new Error("discard_index out of range");
      }
      swappedCard = nextCards[discardIndex];
      nextCards = nextCards.filter((_, i) => i !== discardIndex);
    } else {
      throw new Error("Invalid action for this swap");
    }

    if (nextCards.length > MAX_HAND) {
      throw new Error("Hand exceeds max size");
    }

    await tx
      .prepare(
        `UPDATE poker_hands SET cards = ?::jsonb
         WHERE event_id = ? AND player_id = ?`,
      )
      .run(JSON.stringify(nextCards), eventId, swap.player_id);

    await tx
      .prepare(
        `UPDATE poker_swap_queue
           SET resolved_at = now(), swapped_card = ?::jsonb
         WHERE id = ?`,
      )
      .run(swappedCard ? JSON.stringify(swappedCard) : null, sid);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
