"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import type {
  RoundListItem,
  RoundListCursor,
  RoundListResponse,
} from "@/app/api/rounds/list/route";

const PAGE = 20;

export function ClassicRounds() {
  const { user, loading: authLoading } = useAuth();
  const [rounds, setRounds] = useState<RoundListItem[]>([]);
  const [cursor, setCursor] = useState<RoundListCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const started = useRef(false);

  const fetchPage = useCallback(async (c: RoundListCursor | null) => {
    const qs = new URLSearchParams({ limit: String(PAGE) });
    if (c) {
      qs.set("before_at", c.before_at);
      qs.set("before_id", String(c.before_id));
    }
    const res = await fetch(`/api/rounds/list?${qs}`, { cache: "no-store" });
    if (!res.ok) return { rounds: [], next_cursor: null } as RoundListResponse;
    return (await res.json()) as RoundListResponse;
  }, []);

  useEffect(() => {
    if (!user || started.current) return;
    started.current = true;
    fetchPage(null).then((d) => {
      setRounds(d.rounds);
      setCursor(d.next_cursor);
      setDone(d.next_cursor == null);
      setLoading(false);
    });
  }, [user, fetchPage]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const d = await fetchPage(cursor);
    setRounds((prev) => [...prev, ...d.rounds]);
    setCursor(d.next_cursor);
    setDone(d.next_cursor == null);
    setLoadingMore(false);
  }

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-green-700">Loading…</div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-green-800">All Rounds</h1>
        <Link
          href="/rounds/new"
          className="rounded-full border border-green-600 px-3 py-1.5 text-sm font-semibold text-green-700 hover:bg-green-50"
        >
          + Log round
        </Link>
      </div>

      {loading ? (
        <div className="card py-6 text-center text-gray-400 text-sm">Loading…</div>
      ) : rounds.length === 0 ? (
        <div className="card py-8 text-center text-sm text-gray-500">
          No rounds logged yet.{" "}
          <Link href="/rounds/new" className="font-medium text-green-700 hover:underline">
            Log your first →
          </Link>
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
                That&rsquo;s all {rounds.length} round{rounds.length === 1 ? "" : "s"}.
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
