"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ScoreTrendChart } from "@/components/score-trend-chart";
import type { LeaderboardRow } from "@/app/api/leaderboard/route";
import type { RoundListItem } from "@/app/api/rounds/list/route";
import type { ActiveLiveRound } from "@/app/api/rounds/live/active/route";

export function ClassicHome() {
  const { user, loading: authLoading } = useAuth();
  const [season, setSeason] = useState(new Date().getFullYear());
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [holes, setHoles] = useState<"18" | "9" | "all">("18");
  const [showPointsHelp, setShowPointsHelp] = useState(false);
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [recent, setRecent] = useState<RoundListItem[] | null>(null);
  const [liveRounds, setLiveRounds] = useState<ActiveLiveRound[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const loadBoard = useCallback(
    async (s: number, sc: "mine" | "all", h: "18" | "9" | "all") => {
      setRows(null);
      const res = await fetch(
        `/api/leaderboard?season=${s}&scope=${sc}&holes=${h}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      setRows(data.leaderboard ?? []);
    },
    [],
  );

  const loadRecent = useCallback(async () => {
    const res = await fetch(`/api/rounds/list?limit=5`, { cache: "no-store" });
    const data = await res.json();
    setRecent(data.rounds ?? []);
  }, []);

  const loadLiveRounds = useCallback(async () => {
    const res = await fetch(`/api/rounds/live/active`, { cache: "no-store" });
    if (!res.ok) {
      setLiveRounds([]);
      return;
    }
    const data = await res.json();
    setLiveRounds(data.rounds ?? []);
  }, []);

  useEffect(() => {
    if (user) {
      loadBoard(season, scope, holes);
      loadRecent();
      loadLiveRounds();
    }
  }, [user, season, scope, holes, loadBoard, loadRecent, loadLiveRounds]);

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
        <p className="text-green-600 text-sm"></p>
      </div>

      {liveRounds.length > 0 && (
        <div className="mb-4 space-y-2">
          {liveRounds.map((lr) => (
            <Link
              key={lr.id}
              href={`/rounds/live/${lr.id}`}
              className="flex items-center justify-between rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3 shadow-sm hover:bg-red-100 transition"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-red-700 flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  {lr.i_am_in ? "Resume Live Round" : "Join Live Round"}
                </div>
                <div className="text-xs text-red-900 truncate">
                  {lr.course_name} · {lr.player_count} player
                  {lr.player_count === 1 ? "" : "s"} · {lr.hole_count} holes
                </div>
              </div>
              <span className="text-xl text-red-700 ml-2">→</span>
            </Link>
          ))}
        </div>
      )}

      <Link
        href="/rounds/live/new"
        className="mb-4 flex items-center justify-between rounded-xl bg-green-700 px-4 py-3 text-white shadow-sm hover:bg-green-800 transition"
      >
        <div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-red-400 animate-pulse" />
            Start Live Round
          </div>
          <div className="text-xs text-green-100">
            Score hole-by-hole, leaderboard updates in real time
          </div>
        </div>
        <span className="text-xl">→</span>
      </Link>

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
        <h2 className="text-lg font-bold text-gray-800 mb-2">Season Leaderboard</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs font-medium">
            <button
              onClick={() => setScope("mine")}
              className={`px-2.5 py-1 rounded transition ${
                scope === "mine" ? "bg-white text-green-700 shadow-sm" : "text-gray-500"
              }`}
            >
              My circle
            </button>
            <button
              onClick={() => setScope("all")}
              className={`px-2.5 py-1 rounded transition ${
                scope === "all" ? "bg-white text-green-700 shadow-sm" : "text-gray-500"
              }`}
            >
              Everyone
            </button>
          </div>
          <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs font-medium">
            {(["18", "9", "all"] as const).map((h) => (
              <button
                key={h}
                onClick={() => setHoles(h)}
                className={`px-2.5 py-1 rounded transition ${
                  holes === h ? "bg-white text-green-700 shadow-sm" : "text-gray-500"
                }`}
              >
                {h === "all" ? "All holes" : `${h} holes`}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowPointsHelp((v) => !v)}
            aria-label="How points work"
            className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold hover:bg-gray-200 transition"
          >
            ?
          </button>
        </div>

        {showPointsHelp && (
          <div className="mb-3 text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 leading-relaxed">
            <strong className="text-gray-800">Points</strong>: each round of N
            players awards N pts for 1st, N-1 for 2nd, … 1 for last. Solo rounds
            award nothing.
            <br />
            <strong className="text-gray-800">Ties</strong>: tied players share
            the higher place (e.g. two tied for 1st both get N pts; next player
            is 3rd). <em>(Nt)</em> next to a place count means N of those
            finishes were ties.
          </div>
        )}

        {rows === null ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : rows.length === 0 || (rows.length === 1 && rows[0].rounds_played === 0) ? (
          <div className="text-center py-8 text-gray-400">
            <p>
              {scope === "mine"
                ? "You haven't played a round this season yet."
                : "No rounds logged yet this season."}
            </p>
            <Link
              href="/rounds/new"
              className="inline-block mt-3 text-sm font-medium text-green-700 hover:underline"
            >
              Log a round →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row, i) => {
              const expanded = expandedKey === row.key;
              const hs = row.hole_stats;
              const hasHoleStats = hs && hs.holes_scored > 0;
              return (
                <div
                  key={row.key}
                  className={`rounded-xl ${
                    i === 0
                      ? "bg-yellow-50 border border-yellow-200"
                      : i === 1
                        ? "bg-gray-50 border border-gray-200"
                        : i === 2
                          ? "bg-orange-50 border border-orange-200"
                          : "bg-gray-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedKey((k) => (k === row.key ? null : row.key))
                    }
                    className="w-full flex items-center gap-3 p-3 text-left"
                    aria-expanded={expanded}
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
                        <span
                          className={`ml-auto text-gray-400 text-xs transition-transform ${
                            expanded ? "rotate-180" : ""
                          }`}
                          aria-hidden="true"
                        >
                          ▾
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {row.rounds_played} rounds · {row.wins} wins · best{" "}
                        {row.best_score}
                      </div>
                      {(row.firsts > 0 ||
                        row.seconds > 0 ||
                        row.thirds > 0 ||
                        row.fourths > 0) && (
                        <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-semibold">
                          <span className="bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">
                            1st {row.firsts}
                            {row.firsts_tied > 0 && ` (${row.firsts_tied}t)`}
                          </span>
                          <span className="bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">
                            2nd {row.seconds}
                            {row.seconds_tied > 0 && ` (${row.seconds_tied}t)`}
                          </span>
                          <span className="bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
                            3rd {row.thirds}
                            {row.thirds_tied > 0 && ` (${row.thirds_tied}t)`}
                          </span>
                          <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">
                            💩 {row.fourths}
                            {row.fourths_tied > 0 && ` (${row.fourths_tied}t)`}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-green-700">
                        {row.avg_score}
                      </div>
                      <div className="text-xs text-gray-500">avg</div>
                    </div>
                    <div
                      className="text-right"
                      title="Placement points: N pts for 1st in a round of N players, N-1 for 2nd, …, 1 for last. Solo rounds award nothing."
                    >
                      <div className="text-sm font-semibold text-gray-600">
                        {row.points}
                      </div>
                      <div className="text-xs text-gray-500">pts</div>
                    </div>
                  </button>

                  {expanded && (
                    <div className="px-3 pb-3 -mt-1">
                      {hasHoleStats ? (
                        <div className="rounded-lg bg-white border border-gray-200 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                            Hole stats · {hs.holes_scored} holes
                          </div>
                          <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                            <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                              🦅 {hs.eagles}
                            </span>
                            <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded">
                              Birdies {hs.birdies}
                            </span>
                            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">
                              Pars {hs.pars}
                            </span>
                            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                              Bogeys {hs.bogeys}
                            </span>
                            <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                              2+ {hs.doubles_plus}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg bg-white border border-gray-200 px-3 py-2 text-xs text-gray-500">
                          No hole-by-hole data this season. Use{" "}
                          <Link
                            href="/rounds/new"
                            className="text-green-700 hover:underline"
                          >
                            Upload scorecard
                          </Link>{" "}
                          to track birdies, pars, and more.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {rows && rows.some((r) => r.series.length > 0) && (
        <div className="card mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-3">Score Trends</h2>
          <ScoreTrendChart rows={rows} />
        </div>
      )}

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
