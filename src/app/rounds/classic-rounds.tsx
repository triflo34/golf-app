"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useRoundList } from "./use-round-list";
import type { RoundListItem } from "@/app/api/rounds/list/route";

export function ClassicRounds() {
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
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-green-700">Loading…</div>
      </div>
    );
  }

  const countLabel =
    total == null
      ? ""
      : dq
        ? `${total} match${total === 1 ? "" : "es"}`
        : `${total} round${total === 1 ? "" : "s"}`;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-green-800">All Rounds</h1>
          {countLabel && <div className="text-xs text-gray-500">{countLabel}</div>}
        </div>
        <Link
          href="/rounds/new"
          className="rounded-full border border-green-600 px-3 py-1.5 text-sm font-semibold text-green-700 hover:bg-green-50"
        >
          + Log round
        </Link>
      </div>

      <div className="relative mb-3">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by course or player…"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-8 text-sm text-gray-900"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
          >
            ×
          </button>
        )}
      </div>

      {loading ? (
        <div className="card py-6 text-center text-gray-400 text-sm">Loading…</div>
      ) : rounds.length === 0 ? (
        <div className="card py-8 text-center text-sm text-gray-500">
          {dq ? (
            <>No rounds match &ldquo;{dq}&rdquo;.</>
          ) : (
            <>
              No rounds logged yet.{" "}
              <Link href="/rounds/new" className="font-medium text-green-700 hover:underline">
                Log your first →
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {rounds.map((r) => (
              <RoundCard key={r.id} round={r} />
            ))}
          </div>

          <div className="mt-4 flex flex-col items-center gap-1">
            {!done ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            ) : (
              <span className="text-xs text-gray-400">
                Showing all {rounds.length} round{rounds.length === 1 ? "" : "s"}.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function RoundCard({ round }: { round: RoundListItem }) {
  const lowest =
    round.scores.length > 0
      ? round.scores.reduce((a, s) => (s.gross_score < a ? s.gross_score : a), round.scores[0].gross_score)
      : 0;

  return (
    <Link href={`/rounds/${round.id}`} className="block bg-gray-50 rounded-xl p-3 hover:bg-green-50 transition">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">
          {round.course_name}
          {round.excluded && (
            <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 align-middle text-[9px] font-semibold uppercase text-amber-700">
              excluded
            </span>
          )}
        </div>
        <div className="shrink-0 text-xs text-gray-500">{formatDate(round.played_at)}</div>
      </div>
      {round.scores.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {round.scores.map((s, i) => (
            <div key={`${i}-${s.name}`} className="flex items-center gap-1.5 rounded-lg bg-white px-2 py-1">
              <span className="max-w-[8rem] truncate text-xs text-gray-600">{s.name}</span>
              {s.is_guest && <span className="text-[9px] font-semibold text-yellow-700">★</span>}
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                  s.gross_score === lowest ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                }`}
              >
                {s.gross_score}
              </span>
            </div>
          ))}
        </div>
      )}
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
