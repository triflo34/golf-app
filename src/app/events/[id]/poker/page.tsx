"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
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

type LoadResult = {
  enabled: boolean;
  hands: HandRow[];
  pending_swaps: SwapRow[];
  deck: {
    num_decks: number;
    drawn: PokerCard[];
    wild_card: PokerCard | null;
  } | null;
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

function CardFace({ card }: { card: PokerCard }) {
  return (
    <span
      className={`inline-flex flex-col items-center justify-center w-12 h-16 rounded-md border border-gray-300 bg-white ${SUIT_COLOR[card.suit]}`}
    >
      <span className="text-base font-semibold leading-none">{card.rank}</span>
      <span className="text-xl leading-none">{SUIT_GLYPH[card.suit]}</span>
    </span>
  );
}

export default function PokerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<LoadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      <Link href={`/events/${id}`} className="text-sm text-green-700">
        ← Event
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
                        Swap with {c.rank}
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
                        Discard {c.rank}
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
              Shared by all players as a 6th card when judging hands. Re-rolls
              randomly on every birdie or eagle.
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
                return c ? (
                  <CardFace key={i} card={c} />
                ) : (
                  <span
                    key={i}
                    className="inline-flex items-center justify-center w-12 h-16 rounded-md border border-dashed border-gray-300 text-xs text-gray-400"
                  >
                    empty
                  </span>
                );
              })}
            </div>
            <div className="mt-3 text-xs text-gray-600">
              {myHand.bogey_count} bogey{myHand.bogey_count === 1 ? "" : "s"} this event
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">All players</h2>
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md bg-white">
          {data.hands.map((h) => {
            const pendingForPlayer = data.pending_swaps.filter(
              (s) => s.player_id === h.player_id,
            ).length;
            return (
              <li key={h.player_id} className="px-3 py-2 flex items-center gap-2">
                <span className="flex-1 text-sm text-gray-900 truncate">
                  {h.display_name}
                </span>
                <span className="text-xs text-gray-600">
                  {h.cards.length}/5 cards
                </span>
                {pendingForPlayer > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                    {pendingForPlayer} pending
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

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
