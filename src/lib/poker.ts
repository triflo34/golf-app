import "server-only";
import type { DbApi } from "@/lib/db";
import type { PokerCard } from "@/lib/types";
import { classifyScore, type ScoreType } from "@/lib/events";

const SUITS: PokerCard["suit"][] = ["S", "H", "D", "C"];
const RANKS: PokerCard["rank"][] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "T",
  "J",
  "Q",
  "K",
];
const MAX_HAND = 5;

export function cardKey(c: PokerCard): string {
  return `${c.deck}-${c.suit}${c.rank}`;
}

export function drawRandomCard(
  numDecks: number,
  drawn: PokerCard[],
): PokerCard | null {
  const drawnSet = new Set(drawn.map(cardKey));
  const available: PokerCard[] = [];
  for (let d = 0; d < numDecks; d++) {
    for (const s of SUITS) {
      for (const r of RANKS) {
        const card: PokerCard = { deck: d, suit: s, rank: r };
        if (!drawnSet.has(cardKey(card))) available.push(card);
      }
    }
  }
  if (available.length === 0) return null;
  const idx = Math.floor(Math.random() * available.length);
  return available[idx];
}

/** Per-hole card grant (NOT counting bogey-pair triggers; that's handled separately). */
function baseGrantForType(type: ScoreType): { cards: number; wilds: number; isBogey: boolean } {
  switch (type) {
    case "eagle_or_better":
    case "birdie":
      return { cards: 2, wilds: 1, isBogey: false };
    case "par":
      return { cards: 1, wilds: 0, isBogey: false };
    case "bogey":
      return { cards: 0, wilds: 0, isBogey: true };
    default:
      return { cards: 0, wilds: 0, isBogey: false };
  }
}

type HandRow = {
  cards: PokerCard[];
  wild_count: number;
  bogey_count: number;
};
type DeckRow = {
  num_decks: number;
  drawn: PokerCard[];
};

// JSONB columns can come back as text strings with prepare:false; normalize.
function asJsonArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function loadHand(
  tx: DbApi,
  eventId: number,
  playerId: string,
): Promise<HandRow | null> {
  const row = await tx
    .prepare(
      `SELECT cards, wild_count, bogey_count FROM poker_hands
       WHERE event_id = ? AND player_id = ?`,
    )
    .get<{ cards: unknown; wild_count: number; bogey_count: number }>(eventId, playerId);
  if (!row) return null;
  return {
    cards: asJsonArray<PokerCard>(row.cards),
    wild_count: row.wild_count,
    bogey_count: row.bogey_count,
  };
}

async function loadDeck(tx: DbApi, eventId: number): Promise<DeckRow | null> {
  const row = await tx
    .prepare(
      `SELECT num_decks, drawn FROM poker_deck_state WHERE event_id = ?`,
    )
    .get<{ num_decks: number; drawn: unknown }>(eventId);
  if (!row) return null;
  return {
    num_decks: row.num_decks,
    drawn: asJsonArray<PokerCard>(row.drawn),
  };
}

async function appendDrawn(tx: DbApi, eventId: number, cards: PokerCard[]): Promise<void> {
  if (cards.length === 0) return;
  for (const c of cards) {
    await tx
      .prepare(
        `UPDATE poker_deck_state SET drawn = drawn || ?::jsonb WHERE event_id = ?`,
      )
      .run(JSON.stringify([c]), eventId);
  }
}

async function persistHand(
  tx: DbApi,
  eventId: number,
  playerId: string,
  hand: HandRow,
): Promise<void> {
  await tx
    .prepare(
      `UPDATE poker_hands SET cards = ?::jsonb, wild_count = ?, bogey_count = ?
       WHERE event_id = ? AND player_id = ?`,
    )
    .run(
      JSON.stringify(hand.cards),
      hand.wild_count,
      hand.bogey_count,
      eventId,
      playerId,
    );
}

async function enqueueSwap(
  tx: DbApi,
  eventId: number,
  playerId: string,
  card: PokerCard | null,
  delta: number,
): Promise<void> {
  await tx
    .prepare(
      `INSERT INTO poker_swap_queue (event_id, player_id, incoming_card, delta)
       VALUES (?, ?, ?::jsonb, ?)`,
    )
    .run(eventId, playerId, card ? JSON.stringify(card) : null, delta);
}

/**
 * Apply card-grant logic for one hole score save.
 * Sticky semantics on edits:
 *  - Cards/wilds for non-bogey transitions: emit a net delta (new cards − old cards). Positive
 *    → draw fresh cards (filling hand or queue). Negative → enqueue discard requests.
 *  - Bogey: bogey_count is incremented/decremented by classification change. When the
 *    count rises and the NEW value is even, that bogey crosses the "every 2nd" threshold and
 *    awards a card. We do NOT retroactively reclaim cards when bogey_count drops on edits.
 *
 * Skips entirely if the event has no poker side game enabled, or no poker_hands row exists.
 */
export async function applyPokerForHoleSave(
  tx: DbApi,
  eventId: number,
  playerId: string,
  newStrokes: number,
  par: number,
  oldStrokes: number | null,
): Promise<void> {
  const pokerEnabled = await tx
    .prepare(
      "SELECT 1 AS ok FROM side_games WHERE event_id = ? AND kind = 'poker'",
    )
    .get<{ ok: number }>(eventId);
  if (!pokerEnabled) return;

  const hand = await loadHand(tx, eventId, playerId);
  const deck = await loadDeck(tx, eventId);
  if (!hand || !deck) return;

  const newType = classifyScore(newStrokes, par);
  const oldType = oldStrokes != null ? classifyScore(oldStrokes, par) : null;

  const newG = baseGrantForType(newType);
  const oldG = oldType ? baseGrantForType(oldType) : { cards: 0, wilds: 0, isBogey: false };

  // ---- Bogey count maintenance + threshold draws ----
  let bogeyTriggerCards = 0;
  if (oldG.isBogey && !newG.isBogey) {
    hand.bogey_count = Math.max(0, hand.bogey_count - 1);
  } else if (!oldG.isBogey && newG.isBogey) {
    hand.bogey_count += 1;
    if (hand.bogey_count % 2 === 0) bogeyTriggerCards = 1;
  }
  // bogey -> bogey or non-bogey -> non-bogey: no change

  // ---- Base cards delta ----
  const cardDelta = newG.cards - oldG.cards + bogeyTriggerCards;
  const wildDelta = newG.wilds - oldG.wilds;

  // Apply wilds directly (they don't displace cards).
  hand.wild_count = Math.max(0, hand.wild_count + wildDelta);

  // Apply card deltas.
  if (cardDelta > 0) {
    let drawnNow: PokerCard[] = deck.drawn;
    for (let i = 0; i < cardDelta; i++) {
      const card = drawRandomCard(deck.num_decks, drawnNow);
      if (!card) break; // deck exhausted
      drawnNow = [...drawnNow, card];
      if (hand.cards.length < MAX_HAND) {
        hand.cards = [...hand.cards, card];
      } else {
        await enqueueSwap(tx, eventId, playerId, card, 1);
      }
    }
    // Persist new draws to deck
    const newlyDrawn = drawnNow.slice(deck.drawn.length);
    await appendDrawn(tx, eventId, newlyDrawn);
  } else if (cardDelta < 0) {
    // Enqueue discard prompts; do NOT auto-remove from hand.
    for (let i = 0; i < -cardDelta; i++) {
      await enqueueSwap(tx, eventId, playerId, null, -1);
    }
  }

  await persistHand(tx, eventId, playerId, hand);
}
