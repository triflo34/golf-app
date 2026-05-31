"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ScoreTrendChart } from "@/components/score-trend-chart";
import { V2PageShell } from "@/components/v2/page-shell";
import { V2Card } from "@/components/v2/card";
import { V2Pill } from "@/components/v2/pill";
import { V2SectionTitle } from "@/components/v2/section-title";
import type { LeaderboardRow } from "@/app/api/leaderboard/route";
import type { RoundListItem } from "@/app/api/rounds/list/route";
import type { ActiveLiveRound } from "@/app/api/rounds/live/active/route";

export function V2Home() {
  const { user, loading: authLoading } = useAuth();
  const [season, setSeason] = useState(new Date().getFullYear());
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [holes, setHoles] = useState<"18" | "9" | "all">("18");
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
      <V2PageShell>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="animate-pulse text-[var(--v2-accent)]">Loading…</div>
        </div>
      </V2PageShell>
    );
  }

  const currentYear = new Date().getFullYear();

  return (
    <V2PageShell>
      <div className="mb-4 text-center">
        <h1 className="text-3xl font-bold text-[var(--v2-accent)]">The Match</h1>
      </div>

      {liveRounds.length > 0 && (
        <div className="mb-4 space-y-2">
          {liveRounds.map((lr) => (
            <Link
              key={lr.id}
              href={`/rounds/live/${lr.id}`}
              className="flex items-center justify-between rounded-2xl border-2 border-red-500 bg-red-950/40 px-4 py-3 transition hover:bg-red-950/60"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-red-300 flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-400 animate-pulse" />
                  {lr.i_am_in ? "Resume Live Round" : "Join Live Round"}
                </div>
                <div className="text-xs text-red-200/80 truncate">
                  {lr.course_name} · {lr.player_count} player
                  {lr.player_count === 1 ? "" : "s"} · {lr.hole_count} holes
                </div>
              </div>
              <span className="text-xl text-red-300 ml-2">→</span>
            </Link>
          ))}
        </div>
      )}

      <Link
        href="/rounds/live/new"
        className="mb-4 flex items-center justify-between rounded-2xl border border-[var(--v2-accent)]/40 bg-gradient-to-r from-[var(--v2-accent)]/10 to-transparent px-4 py-3 transition hover:bg-[var(--v2-accent)]/15"
      >
        <div>
          <div className="text-sm font-semibold text-[var(--v2-accent)] flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-red-400 animate-pulse" />
            Start Live Round
          </div>
          <div className="text-xs text-[var(--v2-muted)]">
            Score hole-by-hole, leaderboard updates in real time
          </div>
        </div>
        <span className="text-xl text-[var(--v2-accent)]">→</span>
      </Link>

      <div className="mb-4 flex items-center justify-center gap-3">
        <button
          onClick={() => setSeason((s) => s - 1)}
          className="rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-1 text-[var(--v2-accent)]"
          aria-label="Previous season"
        >
          ←
        </button>
        <span className="text-lg font-bold text-white">{season} Season</span>
        <button
          onClick={() => setSeason((s) => s + 1)}
          disabled={season >= currentYear}
          className="rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-1 text-[var(--v2-accent)] disabled:opacity-30"
          aria-label="Next season"
        >
          →
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-1">
        <V2Pill active={scope === "mine"} onClick={() => setScope("mine")}>
          My circle
        </V2Pill>
        <V2Pill active={scope === "all"} onClick={() => setScope("all")}>
          Everyone
        </V2Pill>
        <span className="mx-1 text-[var(--v2-muted)]">·</span>
        {(["18", "9", "all"] as const).map((h) => (
          <V2Pill key={h} active={holes === h} onClick={() => setHoles(h)}>
            {h === "all" ? "All" : `${h}`}
          </V2Pill>
        ))}
      </div>

      <V2SectionTitle>Season Leaderboard</V2SectionTitle>
      {rows === null ? (
        <V2Card>
          <div className="py-6 text-center text-[var(--v2-muted)]">Loading…</div>
        </V2Card>
      ) : rows.length === 0 ||
        (rows.length === 1 && rows[0].rounds_played === 0) ? (
        <V2Card>
          <div className="py-6 text-center text-sm text-[var(--v2-muted)]">
            <p>
              {scope === "mine"
                ? "You haven't played a round this season yet."
                : "No rounds logged yet this season."}
            </p>
            <Link
              href="/rounds/new"
              className="mt-3 inline-block text-sm font-medium text-[var(--v2-accent)] hover:underline"
            >
              Log a round →
            </Link>
          </div>
        </V2Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => {
            const expanded = expandedKey === row.key;
            const hs = row.hole_stats;
            const hasHoleStats = hs && hs.holes_scored > 0;
            const rankBg =
              i === 0
                ? "bg-[var(--v2-accent)] text-black"
                : i === 1
                  ? "bg-gray-400 text-black"
                  : i === 2
                    ? "bg-orange-500 text-black"
                    : "bg-[var(--v2-surface-2)] text-[var(--v2-muted)]";
            return (
              <V2Card key={row.key} className="!p-0">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedKey((k) => (k === row.key ? null : row.key))
                  }
                  className="flex w-full items-center gap-3 p-3 text-left"
                  aria-expanded={expanded}
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${rankBg}`}
                  >
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate font-semibold text-white">
                      {row.name}
                      {row.is_guest && (
                        <span className="rounded bg-[var(--v2-accent)]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--v2-accent)]">
                          guest
                        </span>
                      )}
                      <span
                        className={`ml-auto text-xs text-[var(--v2-muted)] transition-transform ${
                          expanded ? "rotate-180" : ""
                        }`}
                        aria-hidden="true"
                      >
                        ▾
                      </span>
                    </div>
                    <div className="text-xs text-[var(--v2-muted)]">
                      {row.rounds_played} rounds · {row.wins} wins · best{" "}
                      {row.best_score}
                    </div>
                    {(row.firsts > 0 ||
                      row.seconds > 0 ||
                      row.thirds > 0 ||
                      row.fourths > 0) && (
                      <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-semibold">
                        <span className="rounded bg-[var(--v2-accent)]/20 px-1.5 py-0.5 text-[var(--v2-accent)]">
                          1st {row.firsts}
                          {row.firsts_tied > 0 && ` (${row.firsts_tied}t)`}
                        </span>
                        <span className="rounded bg-gray-500/30 px-1.5 py-0.5 text-gray-200">
                          2nd {row.seconds}
                          {row.seconds_tied > 0 && ` (${row.seconds_tied}t)`}
                        </span>
                        <span className="rounded bg-orange-500/25 px-1.5 py-0.5 text-orange-300">
                          3rd {row.thirds}
                          {row.thirds_tied > 0 && ` (${row.thirds_tied}t)`}
                        </span>
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
                          💩 {row.fourths}
                          {row.fourths_tied > 0 && ` (${row.fourths_tied}t)`}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-[var(--v2-score)]">
                      {row.avg_score}
                    </div>
                    <div className="text-xs text-[var(--v2-muted)]">avg</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-[var(--v2-accent)]">
                      {row.points}
                    </div>
                    <div className="text-xs text-[var(--v2-muted)]">pts</div>
                  </div>
                </button>

                {expanded && hasHoleStats && (
                  <div className="border-t border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2">
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--v2-muted)]">
                      Hole stats · {hs.holes_scored} holes
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                      <span className="rounded bg-[var(--v2-accent)]/20 px-2 py-0.5 text-[var(--v2-accent)]">
                        🦅 {hs.eagles}
                      </span>
                      <span className="rounded bg-red-500/20 px-2 py-0.5 text-red-300">
                        Birdies {hs.birdies}
                      </span>
                      <span className="rounded bg-[var(--v2-score)]/20 px-2 py-0.5 text-[var(--v2-score-soft)]">
                        Pars {hs.pars}
                      </span>
                      <span className="rounded bg-blue-500/20 px-2 py-0.5 text-blue-300">
                        Bogeys {hs.bogeys}
                      </span>
                      <span className="rounded bg-blue-700/30 px-2 py-0.5 text-blue-200">
                        2+ {hs.doubles_plus}
                      </span>
                    </div>
                  </div>
                )}
                {expanded && !hasHoleStats && (
                  <div className="border-t border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-xs text-[var(--v2-muted)]">
                    No hole-by-hole data this season.{" "}
                    <Link
                      href="/rounds/new"
                      className="text-[var(--v2-accent)] hover:underline"
                    >
                      Upload a scorecard
                    </Link>{" "}
                    to track birdies and pars.
                  </div>
                )}
              </V2Card>
            );
          })}
        </div>
      )}

      {rows && rows.some((r) => r.series.length > 0) && (
        <div className="mt-6">
          <V2SectionTitle>Score Trends</V2SectionTitle>
          <V2Card>
            <ScoreTrendChart rows={rows} />
          </V2Card>
        </div>
      )}

      <div className="mt-6">
        <V2SectionTitle>Recent Rounds</V2SectionTitle>
        {recent === null ? (
          <V2Card>
            <div className="py-4 text-center text-sm text-[var(--v2-muted)]">
              Loading…
            </div>
          </V2Card>
        ) : recent.length === 0 ? (
          <V2Card>
            <div className="py-4 text-center text-sm text-[var(--v2-muted)]">
              No rounds yet.
            </div>
          </V2Card>
        ) : (
          <div className="space-y-2">
            {recent.map((round) => (
              <Link
                key={round.id}
                href={`/rounds/${round.id}`}
                className="block"
              >
                <V2Card className="!p-3">
                  <div className="mb-2 flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">
                        {round.course_name}
                      </div>
                      <div className="text-xs text-[var(--v2-muted)]">
                        {formatDate(round.played_at)}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {round.scores.map((s, i) => (
                      <div
                        key={`${i}-${s.name}`}
                        className="flex items-center gap-1.5 rounded-lg bg-[var(--v2-surface-2)] px-2 py-1"
                      >
                        <span className="max-w-[8rem] truncate text-xs text-[var(--v2-muted)]">
                          {s.name}
                        </span>
                        <span className="rounded bg-[var(--v2-score)] px-1.5 py-0.5 text-xs font-bold text-black">
                          {s.gross_score}
                        </span>
                      </div>
                    ))}
                  </div>
                </V2Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </V2PageShell>
  );
}

function formatDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
