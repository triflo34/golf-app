"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import type { PokerCard } from "@/lib/types";
import {
  evaluatePokerHand,
  compareHands,
  HAND_RANKING,
  type HandResult,
} from "@/lib/poker-hand";

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

type LoadResult = {
  enabled: boolean;
  hands: HandRow[];
  pending_swaps: SwapRow[];
  deck: {
    num_decks: number;
    drawn: PokerCard[];
    wild_card: PokerCard | null;
  } | null;
  viewer_is_organizer: boolean;
  winner_player_id: string | null;
  event_completed: boolean;
};

const SUIT_GLYPH: Record<PokerCard["suit"], string> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};

const SUIT_COLOR: Record<PokerCard["suit"], string> = {
  S: "text-gray-900",
  H: "text-red-600",
  D: "text-red-600",
  C: "text-gray-900",
};

// Poker shorthand stores ten as "T"; show players the familiar "10".
function rankLabel(rank: PokerCard["rank"]): string {
  return rank === "T" ? "10" : rank;
}

function CardFace({ card, wild = false }: { card: PokerCard; wild?: boolean }) {
  return (
    <span
      className={`relative inline-flex flex-col items-center justify-center w-12 h-16 rounded-md bg-white ${SUIT_COLOR[card.suit]} ${
        wild ? "ring-2 ring-amber-500 ring-offset-1" : "border border-gray-300"
      }`}
    >
      <span className="text-base font-semibold leading-none">{rankLabel(card.rank)}</span>
      <span className="text-xl leading-none">{SUIT_GLYPH[card.suit]}</span>
      {wild && (
        <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded bg-amber-500 px-1 text-[8px] font-bold leading-tight text-white">
          WILD
        </span>
      )}
    </span>
  );
}

// Face-down card — other players' hands stay hidden until the event finishes.
function CardBack() {
  return (
    <span
      className="inline-flex items-center justify-center w-12 h-16 rounded-md border border-gray-300 text-gray-400"
      style={{
        background:
          "repeating-linear-gradient(45deg, #e5e7eb 0 4px, #f3f4f6 4px 8px)",
      }}
      aria-label="Hidden card"
    >
      ♠
    </span>
  );
}

export function ClassicPoker({ id, backRound }: { id: string; backRound?: string }) {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<LoadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reorderPick, setReorderPick] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/${id}/poker`, { cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to load poker");
      return;
    }
    setData(await res.json());
  }, [id]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    function start() {
      stop();
      timer = setInterval(load, 30_000);
    }
    function stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        load();
        start();
      } else {
        stop();
      }
    }
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user, load]);

  const myHand = useMemo(
    () =>
      user && data && Array.isArray(data.hands)
        ? data.hands.find((h) => h.player_id === user.id) ?? null
        : null,
    [user, data],
  );
  const mySwaps = useMemo(
    () =>
      user && data && Array.isArray(data.pending_swaps)
        ? data.pending_swaps.filter((s) => s.player_id === user.id)
        : [],
    [user, data],
  );

  const wildRank = data?.deck?.wild_card?.rank ?? null;

  // Best 5-card hand each player is holding, keyed by player_id.
  const handResults = useMemo(() => {
    const m = new Map<string, HandResult | null>();
    if (data && Array.isArray(data.hands)) {
      for (const h of data.hands) {
        m.set(h.player_id, evaluatePokerHand(h.cards, wildRank));
      }
    }
    return m;
  }, [data, wildRank]);

  // Leading hand(s) — helps the organizer confirm the winner (ties possible).
  const bestPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    if (!data) return ids;
    let best: HandResult | null = null;
    for (const h of data.hands) {
      const r = handResults.get(h.player_id);
      if (!r) continue;
      if (!best || compareHands(r, best) > 0) {
        best = r;
        ids.clear();
        ids.add(h.player_id);
      } else if (compareHands(r, best) === 0) {
        ids.add(h.player_id);
      }
    }
    return ids;
  }, [data, handResults]);

  const myHandResult = user ? handResults.get(user.id) ?? null : null;

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-green-700 text-lg">Loading...</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href={`/events/${id}`} className="text-sm text-green-700">
          ← Event
        </Link>
        {error && (
          <div className="mt-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    );
  }
  if (!data.enabled) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href={`/events/${id}`} className="text-sm text-green-700">
          ← Event
        </Link>
        <div className="mt-4 rounded-md bg-gray-50 border border-gray-200 px-3 py-3 text-sm text-gray-700">
          Poker isn&rsquo;t enabled for this event.
        </div>
      </div>
    );
  }

  async function reorderSwap(from: number, to: number) {
    if (from === to) return;
    setBusy(true);
    setError(null);
    // Optimistic: swap locally so the UI doesn't flicker through a stale fetch.
    setData((prev) => {
      if (!prev || !user) return prev;
      const next = { ...prev, hands: prev.hands.map((h) => ({ ...h })) };
      const me = next.hands.find((h) => h.player_id === user.id);
      if (!me) return prev;
      const cards = [...me.cards];
      if (from < 0 || to < 0 || from >= cards.length || to >= cards.length) {
        return prev;
      }
      [cards[from], cards[to]] = [cards[to], cards[from]];
      me.cards = cards;
      return next;
    });
    try {
      const res = await fetch(`/api/events/${id}/poker/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      await load();
    } finally {
      setBusy(false);
    }
  }

  function onCardTap(idx: number) {
    if (reorderPick == null) {
      setReorderPick(idx);
      return;
    }
    if (reorderPick === idx) {
      setReorderPick(null);
      return;
    }
    const from = reorderPick;
    setReorderPick(null);
    void reorderSwap(from, idx);
  }

  async function pickWinner(playerId: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${id}/side-games/poker/winner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: playerId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function resolveSwap(
    swap: SwapRow,
    action: "swap" | "skip" | "discard",
    discardIndex: number | null,
  ) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/events/${id}/poker/swaps/${swap.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, discard_index: discardIndex }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-4 pb-24 space-y-5">
      <Link
        href={backRound ? `/events/${id}/score/${backRound}` : `/events/${id}`}
        className="text-sm text-green-700"
      >
        ← {backRound ? "Back to scoring" : "Event"}
      </Link>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {mySwaps.length > 0 && myHand && (() => {
        const s = mySwaps[0];
        const remaining = mySwaps.length - 1;
        return (
          <section className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3">
            <div className="text-sm font-semibold text-amber-900">
              Pending decision
              {remaining > 0 && (
                <span className="ml-2 text-xs font-normal text-amber-700">
                  ({remaining} more after this)
                </span>
              )}
            </div>
            <div className="mt-2 rounded-md bg-white border border-amber-200 p-2">
              {s.incoming_card ? (
                <div>
                  <div className="text-xs text-gray-600 mb-1">
                    New card drawn — keep it and discard one, or skip:
                  </div>
                  <div className="flex items-center gap-2">
                    <CardFace card={s.incoming_card} />
                    <span className="text-xs text-gray-500">incoming</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {myHand.cards.map((c, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={busy}
                        onClick={() => resolveSwap(s, "swap", idx)}
                        className="px-2 py-1 rounded border border-gray-300 text-xs hover:border-amber-500 disabled:opacity-50"
                      >
                        Swap with {rankLabel(c.rank)}
                        {SUIT_GLYPH[c.suit]}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => resolveSwap(s, "skip", null)}
                      className="px-2 py-1 rounded border border-gray-300 text-xs text-gray-600 disabled:opacity-50"
                    >
                      Skip (discard new)
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-xs text-gray-600 mb-2">
                    A previous score edit means you need to discard a card:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {myHand.cards.map((c, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={busy}
                        onClick={() => resolveSwap(s, "discard", idx)}
                        className="px-2 py-1 rounded border border-gray-300 text-xs hover:border-red-500 disabled:opacity-50"
                      >
                        Discard {rankLabel(c.rank)}
                        {SUIT_GLYPH[c.suit]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        );
      })()}

      {data.deck && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            Community wild
          </h2>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex items-center gap-3">
            {data.deck.wild_card ? (
              <CardFace card={data.deck.wild_card} />
            ) : (
              <span className="inline-flex items-center justify-center w-12 h-16 rounded-md border border-dashed border-amber-400 text-xs text-amber-700">
                none
              </span>
            )}
            <p className="text-xs text-amber-900 leading-snug">
              {data.deck.wild_card ? (
                <>
                  Every <span className="font-semibold">{rankLabel(data.deck.wild_card.rank)}</span> is
                  wild — any {rankLabel(data.deck.wild_card.rank)} in a hand can stand in for any card.
                  Re-rolls randomly on every birdie or eagle.
                </>
              ) : (
                <>The wild rank re-rolls randomly on every birdie or eagle.</>
              )}
            </p>
          </div>
        </section>
      )}

      {myHand && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Your hand</h2>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 5 }).map((_, i) => {
                const c = myHand.cards[i];
                if (!c) {
                  return (
                    <span
                      key={i}
                      className="inline-flex items-center justify-center w-12 h-16 rounded-md border border-dashed border-gray-300 text-xs text-gray-400"
                    >
                      empty
                    </span>
                  );
                }
                const selected = reorderPick === i;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={busy}
                    onClick={() => onCardTap(i)}
                    className={`relative rounded-md focus:outline-none disabled:opacity-50 transition ${
                      selected
                        ? "ring-2 ring-blue-500 ring-offset-2 -translate-y-1"
                        : "hover:ring-2 hover:ring-blue-300"
                    }`}
                    aria-pressed={selected}
                    aria-label={`Card ${i + 1}${selected ? " (selected)" : ""}`}
                  >
                    <CardFace card={c} wild={c.rank === data.deck?.wild_card?.rank} />
                  </button>
                );
              })}
            </div>
            {myHandResult && (
              <div className="mt-3 flex items-baseline gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  You&rsquo;ve got
                </span>
                <span className="text-sm font-semibold text-amber-900">
                  {myHandResult.label}
                </span>
                <span className="text-xs text-amber-800">
                  {myHandResult.detail}
                  {myHandResult.usedWild && " · using your wild"}
                </span>
              </div>
            )}
            <div className="mt-2 text-[11px] text-gray-500">
              {reorderPick == null
                ? "Tap a card, then another, to swap their positions."
                : "Tap another card to swap, or tap the selected card again to cancel."}
            </div>
            <div className="mt-2 text-xs text-gray-600">
              {myHand.bogey_count} bogey{myHand.bogey_count === 1 ? "" : "s"} this event
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">
          {data.event_completed && data.viewer_is_organizer
            ? "All hands · pick the winner"
            : "All hands"}
        </h2>
        {!data.event_completed && (
          <p className="mb-2 text-[11px] text-gray-500">
            Other players&rsquo; cards stay face-down until the event is finished.
          </p>
        )}
        {data.event_completed &&
          data.viewer_is_organizer &&
          bestPlayerIds.size > 0 && (
            <p className="mb-2 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-[11px] text-gray-700">
              {bestPlayerIds.size > 1 ? (
                <>
                  {bestPlayerIds.size} players tie for the best hand — confirm the
                  winner below.
                </>
              ) : (
                <>
                  <span className="font-semibold text-gray-900">
                    {
                      data.hands.find((h) => bestPlayerIds.has(h.player_id))
                        ?.display_name
                    }
                  </span>{" "}
                  holds the best hand. Confirm with{" "}
                  <span className="font-semibold">Win</span>.
                </>
              )}
            </p>
          )}
        <ul className="space-y-2">
          {data.hands.map((h) => {
            const pendingForPlayer = data.pending_swaps.filter(
              (s) => s.player_id === h.player_id,
            ).length;
            const isWinner = data.winner_player_id === h.player_id;
            const isMe = h.player_id === user.id;
            // Reveal face-up only once the event is over (or for your own hand).
            const revealed = data.event_completed || isMe;
            const result = handResults.get(h.player_id) ?? null;
            const isBest =
              data.event_completed && bestPlayerIds.has(h.player_id);
            return (
              <li
                key={h.player_id}
                className={`rounded-lg border p-3 ${isWinner ? "border-yellow-400 bg-yellow-50" : "border-gray-200 bg-white"}`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-medium text-gray-900 truncate">
                    {isWinner && "🏆 "}
                    {h.display_name}
                    {isMe && <span className="ml-1 text-[10px] text-gray-400">you</span>}
                  </span>
                  <span className="text-xs text-gray-600">{h.cards.length}/5</span>
                  {isBest && !isWinner && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-200 font-semibold text-yellow-900">
                      {bestPlayerIds.size > 1 ? "tied best" : "best hand"}
                    </span>
                  )}
                  {pendingForPlayer > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                      {pendingForPlayer} pending
                    </span>
                  )}
                  {data.viewer_is_organizer && data.event_completed && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => pickWinner(isWinner ? null : h.player_id)}
                      className={
                        isWinner
                          ? "rounded border border-gray-300 px-2 py-1 text-[11px] font-semibold text-gray-600 disabled:opacity-50"
                          : "rounded bg-green-700 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                      }
                    >
                      {isWinner ? "Unset" : "Win"}
                    </button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {h.cards.length === 0 ? (
                    <span className="text-xs text-gray-400">No cards yet</span>
                  ) : revealed ? (
                    h.cards.map((c, i) => (
                      <CardFace key={i} card={c} wild={c.rank === data.deck?.wild_card?.rank} />
                    ))
                  ) : (
                    h.cards.map((_, i) => <CardBack key={i} />)
                  )}
                </div>
                {revealed && result && (
                  <div className="mt-2 text-xs">
                    <span className="font-semibold text-gray-900">{result.label}</span>
                    <span className="text-gray-500"> · {result.detail}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <details className="rounded-lg border border-gray-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold text-gray-700">
          Poker hand rankings (high to low)
        </summary>
        <ol className="mt-2 space-y-1">
          {HAND_RANKING.map((r, i) => (
            <li key={r.category} className="flex items-baseline gap-2 text-[13px] leading-snug">
              <span className="w-4 shrink-0 text-right text-[11px] text-gray-400">{i + 1}</span>
              <span className="shrink-0 font-semibold text-gray-900">{r.label}</span>
              <span className="text-gray-500">{r.blurb}</span>
            </li>
          ))}
        </ol>
      </details>

      <p className="text-[11px] text-gray-400">
        Cards auto-draw as scores are saved. {data.deck && (
          <>
            {data.deck.drawn.length} / {data.deck.num_decks * 52} drawn from the deck.
          </>
        )}
      </p>
    </div>
  );
}
