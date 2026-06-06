"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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

// Cards keep classic white faces (most legible) with red/black suits — they pop
// nicely against the dark theme.
const SUIT_COLOR: Record<PokerCard["suit"], string> = {
  S: "text-gray-900",
  H: "text-red-600",
  D: "text-red-600",
  C: "text-gray-900",
};

const serif = { fontFamily: "var(--font-fraunces), Georgia, serif" };

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-text-dim)]">
      {children}
    </h2>
  );
}

// Poker shorthand stores ten as "T"; show players the familiar "10".
function rankLabel(rank: PokerCard["rank"]): string {
  return rank === "T" ? "10" : rank;
}

function CardFace({ card }: { card: PokerCard }) {
  return (
    <span
      className={`inline-flex h-16 w-12 flex-col items-center justify-center rounded-md border border-black/10 bg-[#f5f5f0] shadow-sm ${SUIT_COLOR[card.suit]}`}
    >
      <span className="text-base font-semibold leading-none">{rankLabel(card.rank)}</span>
      <span className="text-xl leading-none">{SUIT_GLYPH[card.suit]}</span>
    </span>
  );
}

export function V2Poker({ id, backRound }: { id: string; backRound?: string }) {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<LoadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reorderPick, setReorderPick] = useState<number | null>(null);
  const [showRules, setShowRules] = useState(false);

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
      <div className="v2-bg flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-[var(--v2-gold)]">Loading…</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="v2-bg min-h-screen px-4 py-6 text-[var(--v2-text)]">
        <Link href={`/events/${id}`} className="text-sm text-[var(--v2-gold)]">
          ← Event
        </Link>
        {error && (
          <div className="mt-3 rounded-lg border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>
    );
  }
  if (!data.enabled) {
    return (
      <div className="v2-bg min-h-screen px-4 py-6 text-[var(--v2-text)]">
        <Link href={`/events/${id}`} className="text-sm text-[var(--v2-gold)]">
          ← Event
        </Link>
        <div className="v2-card mt-4 text-sm text-[var(--v2-text-dim)]">
          Poker isn&rsquo;t enabled for this event.
        </div>
      </div>
    );
  }

  async function reorderSwap(from: number, to: number) {
    if (from === to) return;
    setBusy(true);
    setError(null);
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

  async function resolveSwap(
    swap: SwapRow,
    action: "swap" | "skip" | "discard",
    discardIndex: number | null,
  ) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${id}/poker/swaps/${swap.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, discard_index: discardIndex }),
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

  return (
    <div className="v2-bg min-h-screen text-[var(--v2-text)]">
      <div className="mx-auto max-w-lg space-y-5 px-4 py-4 pb-28">
        <Link
          href={backRound ? `/events/${id}/score/${backRound}` : `/events/${id}`}
          className="text-sm text-[var(--v2-gold)]"
        >
          ← {backRound ? "Back to scoring" : "Event"}
        </Link>

        <div className="flex items-center justify-between gap-2">
          <h1 className="text-[22px] font-medium text-[var(--v2-gold)]" style={serif}>
            Poker
          </h1>
          <button
            type="button"
            onClick={() => setShowRules((v) => !v)}
            aria-expanded={showRules}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--v2-gold)]/40 px-3 py-1 text-xs font-medium text-[var(--v2-gold)] hover:bg-[var(--v2-gold)]/10"
          >
            How cards work
            <span aria-hidden="true" className={`transition-transform ${showRules ? "rotate-180" : ""}`}>▾</span>
          </button>
        </div>

        {showRules && <RulesPanel />}

        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {mySwaps.length > 0 && myHand && (
          <SwapDecision
            swap={mySwaps[0]}
            remaining={mySwaps.length - 1}
            hand={myHand}
            busy={busy}
            onResolve={resolveSwap}
          />
        )}

        {data.deck && (
          <section>
            <SectionLabel>Community wild</SectionLabel>
            <div className="flex items-center gap-3 rounded-xl border border-[var(--v2-gold)]/30 bg-[var(--v2-gold)]/8 p-3">
              {data.deck.wild_card ? (
                <CardFace card={data.deck.wild_card} />
              ) : (
                <span className="inline-flex h-16 w-12 items-center justify-center rounded-md border border-dashed border-[var(--v2-gold)]/40 text-xs text-[var(--v2-gold)]">
                  none
                </span>
              )}
              <p className="text-xs leading-snug text-[var(--v2-text-dim)]">
                Shared by all players as a 6th card when judging hands. Re-rolls randomly on every
                birdie or eagle.
              </p>
            </div>
          </section>
        )}

        {myHand && (
          <section>
            <SectionLabel>Your hand</SectionLabel>
            <div className="v2-card">
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 5 }).map((_, i) => {
                  const c = myHand.cards[i];
                  if (!c) {
                    return (
                      <span
                        key={i}
                        className="inline-flex h-16 w-12 items-center justify-center rounded-md border border-dashed border-[var(--v2-border)] text-xs text-[var(--v2-text-faint)]"
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
                      className={`relative rounded-md transition focus:outline-none disabled:opacity-50 ${
                        selected
                          ? "-translate-y-1 ring-2 ring-[var(--v2-gold)] ring-offset-2 ring-offset-[var(--v2-bg-1)]"
                          : "hover:ring-2 hover:ring-[var(--v2-gold)]/50"
                      }`}
                      aria-pressed={selected}
                      aria-label={`Card ${i + 1}${selected ? " (selected)" : ""}`}
                    >
                      <CardFace card={c} />
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 text-[11px] text-[var(--v2-text-faint)]">
                {reorderPick == null
                  ? "Optional: tap two cards to reorder them. Cards are earned automatically from your scores."
                  : "Tap another card to swap positions, or tap the selected card again to cancel."}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--v2-text-dim)]">
                <span>{myHand.cards.length}/5 cards held</span>
                <span>
                  {myHand.bogey_count} bogey{myHand.bogey_count === 1 ? "" : "s"} ·{" "}
                  {myHand.bogey_count % 2 === 1 ? "1 more earns a card" : "next pair earns a card"}
                </span>
              </div>
            </div>
          </section>
        )}

        <section>
          <SectionLabel>All players</SectionLabel>
          <ul className="v2-card divide-y divide-[var(--v2-border)] !p-0">
            {data.hands.map((h) => {
              const pendingForPlayer = data.pending_swaps.filter(
                (s) => s.player_id === h.player_id,
              ).length;
              return (
                <li key={h.player_id} className="flex items-center gap-2 px-3.5 py-2.5">
                  <span className="flex-1 truncate text-sm text-[var(--v2-text)]">
                    {h.display_name}
                  </span>
                  <span className="text-xs text-[var(--v2-text-dim)]">{h.cards.length}/5 cards</span>
                  {pendingForPlayer > 0 && (
                    <span className="rounded bg-[var(--v2-gold)]/20 px-1.5 py-0.5 text-[10px] text-[var(--v2-gold)]">
                      {pendingForPlayer} pending
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <p className="text-[11px] text-[var(--v2-text-faint)]">
          Cards auto-draw as scores are saved.{" "}
          {data.deck && (
            <>
              {data.deck.drawn.length} / {data.deck.num_decks * 52} drawn from the deck.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

const RULES: { label: string; desc: string; tone: string }[] = [
  { label: "Birdie or better", desc: "Draw 2 cards — and the community wild re-rolls.", tone: "bg-red-500/20 text-red-300" },
  { label: "Par", desc: "Draw 1 card.", tone: "bg-[var(--v2-sage)]/20 text-[var(--v2-score-soft)]" },
  { label: "Bogey", desc: "No card on its own — but every 2nd bogey earns 1 card.", tone: "bg-blue-500/20 text-blue-300" },
  { label: "Double or worse", desc: "No card.", tone: "bg-white/5 text-[var(--v2-text-dim)]" },
];

function RulesPanel() {
  return (
    <section className="rounded-xl border border-[var(--v2-gold)]/25 bg-[var(--v2-gold)]/[0.06] p-3.5 text-sm">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--v2-gold)]">
        How you earn cards
      </div>
      <ul className="space-y-1.5">
        {RULES.map((r) => (
          <li key={r.label} className="flex items-start gap-2">
            <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${r.tone}`}>
              {r.label}
            </span>
            <span className="text-[13px] leading-snug text-[var(--v2-text-dim)]">{r.desc}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-1.5 border-t border-[var(--v2-border)] pt-3 text-[13px] leading-snug text-[var(--v2-text-dim)]">
        <p>
          <span className="text-[var(--v2-text)]">Your hand holds 5 cards.</span> Earn one while full
          and you choose to keep it (replacing a card) or decline.
        </p>
        <p>
          <span className="text-[var(--v2-text)]">Community wild</span> is a shared 6th card everyone
          may use; it re-rolls on every birdie or eagle.
        </p>
        <p>
          <span className="text-[var(--v2-text)]">Best 5-card poker hand wins the pot</span> — the
          organizer confirms the winner at the end.
        </p>
      </div>
    </section>
  );
}

function SwapDecision({
  swap,
  remaining,
  hand,
  busy,
  onResolve,
}: {
  swap: SwapRow;
  remaining: number;
  hand: HandRow;
  busy: boolean;
  onResolve: (
    swap: SwapRow,
    action: "swap" | "skip" | "discard",
    discardIndex: number | null,
  ) => void;
}) {
  const isIncoming = swap.incoming_card != null;
  return (
    <section className="rounded-xl border border-[var(--v2-gold)]/45 bg-[var(--v2-gold)]/10 p-3.5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-[var(--v2-gold)]">
          {isIncoming ? "New card earned" : "Discard a card"}
        </div>
        {remaining > 0 && (
          <span className="rounded-full bg-[var(--v2-gold)]/20 px-2 py-0.5 text-[10px] font-medium text-[var(--v2-gold)]">
            {remaining} more after this
          </span>
        )}
      </div>

      {isIncoming ? (
        <>
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3">
            <CardFace card={swap.incoming_card!} />
            <p className="text-[13px] leading-snug text-[var(--v2-text-dim)]">
              Your hand is full. Tap one of your cards below to{" "}
              <span className="text-[var(--v2-text)]">swap it for this one</span>, or keep your hand
              as-is.
            </p>
          </div>
          <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-text-dim)]">
            Replace which card?
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {hand.cards.map((c, idx) => (
              <button
                key={idx}
                type="button"
                disabled={busy}
                onClick={() => onResolve(swap, "swap", idx)}
                className="rounded-md transition hover:-translate-y-0.5 hover:ring-2 hover:ring-[var(--v2-red)] focus:outline-none disabled:opacity-50"
                aria-label={`Replace ${rankLabel(c.rank)}${SUIT_GLYPH[c.suit]} with the new card`}
              >
                <CardFace card={c} />
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve(swap, "skip", null)}
            className="mt-3 w-full rounded-lg border border-[var(--v2-border)] py-2 text-xs font-medium text-[var(--v2-text-dim)] hover:border-[var(--v2-gold)]/40 hover:text-[var(--v2-text)] disabled:opacity-50"
          >
            Keep my hand — discard the new card
          </button>
        </>
      ) : (
        <>
          <p className="mt-2 text-[13px] leading-snug text-[var(--v2-text-dim)]">
            A score edit lowered your cards. Tap a card to discard it.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {hand.cards.map((c, idx) => (
              <button
                key={idx}
                type="button"
                disabled={busy}
                onClick={() => onResolve(swap, "discard", idx)}
                className="rounded-md transition hover:-translate-y-0.5 hover:ring-2 hover:ring-[var(--v2-red)] focus:outline-none disabled:opacity-50"
                aria-label={`Discard ${rankLabel(c.rank)}${SUIT_GLYPH[c.suit]}`}
              >
                <CardFace card={c} />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
