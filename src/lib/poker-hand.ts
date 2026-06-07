// Pure poker-hand evaluation for the score-poker side game.
//
// This module is intentionally framework-free (no "server-only", no DB) so it
// can run in the browser to give a player a live read on their hand, AND on the
// server if we ever want to auto-score the pot.
//
// The game uses a "community wild" rank: every card whose rank matches the
// current wild rank can stand in for ANY card. With wilds in play the ceiling
// hand is Five of a Kind, which outranks a (natural) Royal Flush — matching the
// house rules shown to players.

import type { PokerCard } from "@/lib/types";

export type HandCategory =
  | "five_of_a_kind"
  | "royal_flush"
  | "straight_flush"
  | "four_of_a_kind"
  | "full_house"
  | "flush"
  | "straight"
  | "three_of_a_kind"
  | "two_pair"
  | "one_pair"
  | "high_card";

export type HandResult = {
  category: HandCategory;
  /** Short human label, e.g. "Two Pair". */
  label: string;
  /** Fuller description, e.g. "Kings & Sevens" or "Tens full of Fours". */
  detail: string;
  /** Comparable score: [categoryWeight, ...tiebreakers], higher wins. */
  score: number[];
  /** True if at least one wild card contributed to the hand. */
  usedWild: boolean;
};

const RANK_VALUE: Record<PokerCard["rank"], number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

const SUITS: PokerCard["suit"][] = ["S", "H", "D", "C"];
const RANKS = Object.keys(RANK_VALUE) as PokerCard["rank"][];

const CATEGORY_WEIGHT: Record<HandCategory, number> = {
  high_card: 1,
  one_pair: 2,
  two_pair: 3,
  three_of_a_kind: 4,
  straight: 5,
  flush: 6,
  full_house: 7,
  four_of_a_kind: 8,
  straight_flush: 9,
  royal_flush: 10,
  five_of_a_kind: 11,
};

export const HAND_LABELS: Record<HandCategory, string> = {
  five_of_a_kind: "Five of a Kind",
  royal_flush: "Royal Flush",
  straight_flush: "Straight Flush",
  four_of_a_kind: "Four of a Kind",
  full_house: "Full House",
  flush: "Flush",
  straight: "Straight",
  three_of_a_kind: "Three of a Kind",
  two_pair: "Two Pair",
  one_pair: "One Pair",
  high_card: "High Card",
};

/** House ranking, highest first — handy for an in-app rules reference. */
export const HAND_RANKING: { category: HandCategory; label: string; blurb: string }[] = [
  { category: "five_of_a_kind", label: "Five of a Kind", blurb: "Five cards of the same rank (only possible with a wild)." },
  { category: "royal_flush", label: "Royal Flush", blurb: "Natural 10-J-Q-K-A, all one suit." },
  { category: "straight_flush", label: "Straight Flush", blurb: "Five in a row, all one suit." },
  { category: "four_of_a_kind", label: "Four of a Kind", blurb: "Four cards of the same rank." },
  { category: "full_house", label: "Full House", blurb: "Three of a kind plus a pair." },
  { category: "flush", label: "Flush", blurb: "Five of the same suit, not in sequence." },
  { category: "straight", label: "Straight", blurb: "Five in a row, mixed suits." },
  { category: "three_of_a_kind", label: "Three of a Kind", blurb: "Three cards of the same rank." },
  { category: "two_pair", label: "Two Pair", blurb: "Two separate pairs." },
  { category: "one_pair", label: "One Pair", blurb: "Two cards of the same rank." },
  { category: "high_card", label: "High Card", blurb: "Nothing better — your highest card plays." },
];

const NAME_SINGULAR: Record<number, string> = {
  14: "Ace", 13: "King", 12: "Queen", 11: "Jack", 10: "Ten",
  9: "Nine", 8: "Eight", 7: "Seven", 6: "Six", 5: "Five", 4: "Four", 3: "Three", 2: "Two",
};
const NAME_PLURAL: Record<number, string> = {
  14: "Aces", 13: "Kings", 12: "Queens", 11: "Jacks", 10: "Tens",
  9: "Nines", 8: "Eights", 7: "Sevens", 6: "Sixes", 5: "Fives", 4: "Fours", 3: "Threes", 2: "Twos",
};

const sing = (v: number) => NAME_SINGULAR[v] ?? String(v);
const plur = (v: number) => NAME_PLURAL[v] ?? String(v);

type Scored = { category: HandCategory; score: number[] };

/** Compare two score arrays lexicographically. >0 if a beats b. */
export function compareScores(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

export function compareHands(a: HandResult, b: HandResult): number {
  return compareScores(a.score, b.score);
}

// Detect a 5-distinct-card straight (Ace plays high or low). Returns the high
// card value of the straight, or 0 if not a straight.
function straightHigh(values: number[]): number {
  const uniq = Array.from(new Set(values)).sort((x, y) => x - y);
  if (uniq.length !== 5) return 0;
  if (uniq[4] - uniq[0] === 4) return uniq[4];
  // Wheel: A-2-3-4-5 (Ace low) ranks as a 5-high straight.
  if (uniq[0] === 2 && uniq[1] === 3 && uniq[2] === 4 && uniq[3] === 5 && uniq[4] === 14) {
    return 5;
  }
  return 0;
}

// Evaluate a concrete set of 1–5 cards (no wilds left — already substituted).
function evaluateConcrete(cards: PokerCard[]): Scored {
  const values = cards.map((c) => RANK_VALUE[c.rank]);
  const n = cards.length;

  // Group by rank value, sorted by (count desc, value desc). For all
  // count-based hands this ordering yields the exact poker tiebreak sequence
  // (primary group(s) first, then kickers by value).
  const countByValue = new Map<number, number>();
  for (const v of values) countByValue.set(v, (countByValue.get(v) ?? 0) + 1);
  const groups = Array.from(countByValue.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || b.value - a.value);
  const groupValues = groups.map((g) => g.value);

  const isFlush = n === 5 && cards.every((c) => c.suit === cards[0].suit);
  const high = straightHigh(values);
  const isStraight = high > 0;

  const make = (category: HandCategory, tiebreak: number[]): Scored => ({
    category,
    score: [CATEGORY_WEIGHT[category], ...tiebreak],
  });

  if (groups[0].count >= 5) return make("five_of_a_kind", [groups[0].value]);
  if (isStraight && isFlush) {
    return high === 14
      ? make("royal_flush", [])
      : make("straight_flush", [high]);
  }
  if (groups[0].count === 4) return make("four_of_a_kind", groupValues);
  if (groups[0].count === 3 && (groups[1]?.count ?? 0) >= 2) {
    return make("full_house", groupValues);
  }
  if (isFlush) return make("flush", groupValues);
  if (isStraight) return make("straight", [high]);
  if (groups[0].count === 3) return make("three_of_a_kind", groupValues);
  if (groups[0].count === 2 && (groups[1]?.count ?? 0) === 2) {
    return make("two_pair", groupValues);
  }
  if (groups[0].count === 2) return make("one_pair", groupValues);
  return make("high_card", groupValues);
}

// Every distinct card type a wild could become.
const WILD_CANDIDATES: PokerCard[] = SUITS.flatMap((suit) =>
  RANKS.map((rank) => ({ deck: 0, suit, rank })),
);

// Try every assignment of the wild cards (combinations with repetition — order
// among wilds doesn't matter) and keep the best resulting hand.
function bestWithWilds(natural: PokerCard[], wildCount: number): Scored {
  let best: Scored | null = null;
  const chosen: PokerCard[] = [];
  const rec = (start: number, remaining: number) => {
    if (remaining === 0) {
      const scored = evaluateConcrete(natural.concat(chosen));
      if (!best || compareScores(scored.score, best.score) > 0) best = scored;
      return;
    }
    for (let i = start; i < WILD_CANDIDATES.length; i++) {
      chosen.push(WILD_CANDIDATES[i]);
      rec(i, remaining - 1);
      chosen.pop();
    }
  };
  rec(0, wildCount);
  // `best` is always assigned (rec hits the base case at least once).
  return best!;
}

function describe(category: HandCategory, tb: number[]): string {
  switch (category) {
    case "five_of_a_kind":
      return `Five ${plur(tb[0])}`;
    case "royal_flush":
      return "the nuts";
    case "straight_flush":
      return `${sing(tb[0])}-high straight flush`;
    case "four_of_a_kind":
      return `Four ${plur(tb[0])}`;
    case "full_house":
      return `${plur(tb[0])} full of ${plur(tb[1])}`;
    case "flush":
      return `${sing(tb[0])}-high flush`;
    case "straight":
      return `${sing(tb[0])}-high straight`;
    case "three_of_a_kind":
      return `Three ${plur(tb[0])}`;
    case "two_pair":
      return `${plur(tb[0])} & ${plur(tb[1])}`;
    case "one_pair":
      return `Pair of ${plur(tb[0])}`;
    case "high_card":
      return `${sing(tb[0])} high`;
  }
}

/**
 * Evaluate a player's hand (1–5 cards). Cards whose rank matches `wildRank` are
 * treated as wild. Returns null for an empty hand.
 */
export function evaluatePokerHand(
  cards: PokerCard[],
  wildRank: PokerCard["rank"] | null,
): HandResult | null {
  if (!cards || cards.length === 0) return null;

  const natural: PokerCard[] = [];
  let wildCount = 0;
  for (const c of cards) {
    if (wildRank && c.rank === wildRank) wildCount++;
    else natural.push(c);
  }

  let scored: Scored;
  if (wildCount === 0) {
    scored = evaluateConcrete(natural);
  } else if (wildCount >= 5) {
    // Five wilds (only reachable with multi-deck) — five Aces, the ceiling.
    scored = { category: "five_of_a_kind", score: [CATEGORY_WEIGHT.five_of_a_kind, 14] };
  } else {
    scored = bestWithWilds(natural, wildCount);
  }

  const tb = scored.score.slice(1);
  return {
    category: scored.category,
    label: HAND_LABELS[scored.category],
    detail: describe(scored.category, tb),
    score: scored.score,
    usedWild: wildCount > 0,
  };
}
