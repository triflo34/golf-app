"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import type { LeaderboardRow } from "@/app/api/leaderboard/route";
import type { RoundListItem } from "@/app/api/rounds/list/route";

export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const [season, setSeason] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [recent, setRecent] = useState<RoundListItem[] | null>(null);

  const loadBoard = useCallback(async (s: number) => {
    setRows(null);
    const res = await fetch(`/api/leaderboard?season=${s}`, { cache: "no-store" });
    const data = await res.json();
    setRows(data.leaderboard ?? []);
  }, []);

  const loadRecent = useCallback(async () => {
    const res = await fetch(`/api/rounds/list?limit=5`, { cache: "no-store" });
    const data = await res.json();
    setRecent(data.rounds ?? []);
  }, []);

  useEffect(() => {
    if (user) {
      loadBoard(season);
      loadRecent();
    }
  }, [user, season, loadBoard, loadRecent]);

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-green-700 text-lg">Loading...</div>
      </div>
    );
  }

  const currentYear = new Date().getFullYear();

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-green-800">The Match</h1>
        <p className="text-green-600 text-sm">Oakland County Golf League</p>
      </div>

      <div className="flex items-center justify-center gap-3 mb-6">
        <button
          onClick={() => setSeason((s) => s - 1)}
          className="px-3 py-1 rounded-lg bg-white text-green-700 font-medium shadow-sm"
          aria-label="Previous season"
        >
          ←
        </button>
        <span className="text-lg font-bold text-green-800">{season} Season</span>
        <button
          onClick={() => setSeason((s) => s + 1)}
          disabled={season >= currentYear}
          className="px-3 py-1 rounded-lg bg-white text-green-700 font-medium shadow-sm disabled:opacity-30"
          aria-label="Next season"
        >
          →
        </button>
      </div>

      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-800 mb-3">Season Leaderboard</h2>

        {rows === null ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p>No rounds logged yet this season.</p>
            <Link
              href="/rounds/new"
              className="inline-block mt-3 text-sm font-medium text-green-700 hover:underline"
            >
              Log the first one →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div
                key={row.key}
                className={`flex items-center gap-3 p-3 rounded-xl ${
                  i === 0
                    ? "bg-yellow-50 border border-yellow-200"
                    : i === 1
                      ? "bg-gray-50 border border-gray-200"
                      : i === 2
                        ? "bg-orange-50 border border-orange-200"
                        : "bg-gray-50"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    i === 0
                      ? "bg-yellow-400 text-yellow-900"
                      : i === 1
                        ? "bg-gray-300 text-gray-700"
                        : i === 2
                          ? "bg-orange-300 text-orange-800"
                          : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800 truncate flex items-center gap-1.5">
                    {row.name}
                    {row.is_guest && (
                      <span className="text-[10px] font-semibold text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">
                        guest
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {row.rounds_played} rounds · {row.wins} wins
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-green-700">{row.avg_score}</div>
                  <div className="text-xs text-gray-500">avg</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-600">{row.best_score}</div>
                  <div className="text-xs text-gray-500">best</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-bold text-gray-800 mb-3">Recent Rounds</h2>
        {recent === null ? (
          <div className="text-center py-6 text-gray-400 text-sm">Loading...</div>
        ) : recent.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">No rounds yet.</div>
        ) : (
          <div className="space-y-3">
            {recent.map((round) => (
              <Link
                key={round.id}
                href={`/rounds/${round.id}`}
                className="block bg-gray-50 rounded-xl p-3 hover:bg-green-50 transition"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-800 text-sm truncate">
                      {round.course_name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDate(round.played_at)}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {round.scores.map((s, i) => (
                    <div
                      key={`${i}-${s.name}`}
                      className="flex items-center gap-1.5 bg-white rounded-lg px-2 py-1"
                    >
                      <span className="text-xs text-gray-600 truncate max-w-[8rem]">
                        {s.name}
                      </span>
                      {s.is_guest && (
                        <span className="text-[9px] font-semibold text-yellow-700">
                          ★
                        </span>
                      )}
                      <span className="text-xs font-bold text-green-700 bg-green-100 rounded px-1.5 py-0.5">
                        {s.gross_score}
                      </span>
                    </div>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
