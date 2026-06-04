"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { V2PageShell } from "@/components/v2/page-shell";
import { V2Card } from "@/components/v2/card";
import { useRoundList } from "./use-round-list";
import type { RoundListItem } from "@/app/api/rounds/list/route";

export function V2Rounds() {
  const { user, loading: authLoading } = useAuth();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const enabled = !authLoading && !!user;
  const { rounds, total, loading, loadingMore, done, loadMore } = useRoundList(dq, enabled);

  if (authLoading || !user) {
    return (
      <V2PageShell>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="animate-pulse text-[var(--v2-gold)]">Loading…</div>
        </div>
      </V2PageShell>
    );
  }

  const countLabel =
    total == null
      ? ""
      : dq
        ? `${total} match${total === 1 ? "" : "es"}`
        : `${total} round${total === 1 ? "" : "s"}`;

  return (
    <V2PageShell>
      <header className="mb-3 flex items-center justify-between gap-2 py-1">
        <div>
          <h1
            className="text-[20px] font-medium leading-tight text-[var(--v2-gold)]"
            style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
          >
            All Rounds
          </h1>
          {countLabel && (
            <div className="text-[11px] text-[var(--v2-text-dim)]">{countLabel}</div>
          )}
        </div>
        <Link
          href="/rounds/new"
          className="inline-flex items-center gap-1 rounded-full border border-[var(--v2-gold)]/40 px-3 py-1.5 text-xs font-medium text-[var(--v2-gold)] hover:bg-[var(--v2-gold)]/10"
        >
          + Log round
        </Link>
      </header>

      <div className="relative mb-3">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by course or player…"
          className="w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 pr-8 text-sm text-[var(--v2-text)] placeholder-[var(--v2-text-dim)]"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--v2-text-dim)] hover:text-[var(--v2-text)]"
          >
            ×
          </button>
        )}
      </div>

      {loading ? (
        <V2Card>
          <div className="py-6 text-center text-[var(--v2-text-dim)]">Loading…</div>
        </V2Card>
      ) : rounds.length === 0 ? (
        <V2Card>
          <div className="py-8 text-center text-sm text-[var(--v2-text-dim)]">
            {dq ? (
              <>No rounds match &ldquo;{dq}&rdquo;.</>
            ) : (
              <>
                No rounds logged yet.{" "}
                <Link href="/rounds/new" className="font-medium text-[var(--v2-gold)] hover:underline">
                  Log your first →
                </Link>
              </>
            )}
          </div>
        </V2Card>
      ) : (
        <>
          <ul className="space-y-2.5">
            {rounds.map((r) => (
              <li key={r.id}>
                <RoundCard round={r} />
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-col items-center gap-1">
            {!done ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface)] px-4 py-2 text-sm font-medium text-[var(--v2-text)] disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            ) : (
              <span className="text-xs text-[var(--v2-text-faint)]">
                Showing all {rounds.length} round{rounds.length === 1 ? "" : "s"}.
              </span>
            )}
          </div>
        </>
      )}
    </V2PageShell>
  );
}

function RoundCard({ round }: { round: RoundListItem }) {
  const lowest =
    round.scores.length > 0
      ? round.scores.reduce((a, s) => (s.gross_score < a ? s.gross_score : a), round.scores[0].gross_score)
      : 0;

  return (
    <Link href={`/rounds/${round.id}`} className="block">
      <V2Card interactive className="!p-3">
        <div className="flex items-start justify-between gap-2">
          <div
            className="min-w-0 flex-1 truncate text-[14px] font-medium text-[var(--v2-text)]"
            style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
          >
            {round.course_name}
            {round.excluded && (
              <span className="ml-1.5 rounded bg-[var(--v2-amber-warn)]/20 px-1 py-0.5 align-middle text-[8.5px] font-semibold uppercase text-[var(--v2-amber-warn)]">
                excluded
              </span>
            )}
          </div>
          <div className="shrink-0 text-xs text-[var(--v2-text-dim)]">{formatDate(round.played_at)}</div>
        </div>
        {round.scores.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {round.scores.map((s, i) => {
              const isWinner = s.gross_score === lowest;
              return (
                <span
                  key={`${i}-${s.name}`}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 ${
                    isWinner
                      ? "border border-[var(--v2-gold)]/30 bg-[var(--v2-gold)]/12"
                      : "bg-[var(--v2-surface-2)]"
                  }`}
                >
                  <span className="max-w-[7rem] truncate text-[11px] text-[var(--v2-text-dim)]">
                    {s.name}
                    {s.is_guest && <span className="ml-0.5 text-[var(--v2-gold)]">★</span>}
                  </span>
                  <span className={`text-[11px] font-bold ${isWinner ? "text-[var(--v2-gold)]" : "text-[var(--v2-text)]"}`}>
                    {s.gross_score}
                  </span>
                </span>
              );
            })}
          </div>
        )}
      </V2Card>
    </Link>
  );
}

function formatDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}
