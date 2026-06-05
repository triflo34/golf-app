"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PlayerPicker } from "@/components/player-picker";
import { ScoreTrendChart } from "@/components/score-trend-chart";
import { V2PageShell } from "@/components/v2/page-shell";
import { V2Card } from "@/components/v2/card";
import { V2Pill } from "@/components/v2/pill";
import { V2StatTile } from "@/components/v2/stat-tile";
import { V2SectionTitle } from "@/components/v2/section-title";
import { V2SegmentedControl } from "@/components/v2/segmented-control";
import { V2LeaderboardRow } from "@/components/v2/leaderboard-row";
import { V2Avatar } from "@/components/v2/avatar";
import { useAuth } from "@/components/auth-provider";
import type { H2HResult } from "@/app/api/h2h/route";
import type { PlayerStats } from "@/app/api/player/route";
import type { FunStats } from "@/app/api/stats/fun/route";
import type { LeaderboardRow } from "@/app/api/leaderboard/route";

type Tab = "leaderboard" | "h2h" | "player" | "fun";

export function V2Stats() {
  const [tab, setTab] = useState<Tab>("leaderboard");
  const [season, setSeason] = useState<number | "all">("all");

  return (
    <V2PageShell>
      <div className="mb-4 flex items-center justify-center gap-5 border-b border-[var(--v2-gold)]/15 pb-2">
        <TabButton
          active={tab === "leaderboard"}
          onClick={() => setTab("leaderboard")}
        >
          Board
        </TabButton>
        <TabButton active={tab === "h2h"} onClick={() => setTab("h2h")}>
          H2H
        </TabButton>
        <TabButton active={tab === "player"} onClick={() => setTab("player")}>
          Player
        </TabButton>
        <TabButton active={tab === "fun"} onClick={() => setTab("fun")}>
          Highlights
        </TabButton>
      </div>

      <SeasonFilter season={season} onChange={setSeason} />

      {tab === "leaderboard" ? (
        <LeaderboardTab season={season} />
      ) : tab === "h2h" ? (
        <H2HTab season={season} />
      ) : tab === "player" ? (
        <PlayerTab season={season} />
      ) : (
        <FunTab season={season} />
      )}
    </V2PageShell>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative pb-2 text-[13px] font-medium transition ${
        active ? "text-[var(--v2-gold)]" : "text-[var(--v2-text-dim)] hover:text-[var(--v2-text)]"
      }`}
      style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
    >
      {children}
      {active && (
        <span className="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full bg-[var(--v2-gold)]" />
      )}
    </button>
  );
}

// ===========================================================================
// Leaderboard tab — spec §7.3 + §5.4

type Metric = "points" | "avg" | "wins" | "best";

function LeaderboardTab({ season }: { season: number | "all" }) {
  const { user } = useAuth();
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [holes, setHoles] = useState<"18" | "9" | "all">("18");
  const [metric, setMetric] = useState<Metric>("points");
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showPointsHelp, setShowPointsHelp] = useState(false);

  useEffect(() => {
    setRows(null);
    const s = season === "all" ? new Date().getFullYear() : season;
    fetch(`/api/leaderboard?season=${s}&scope=${scope}&holes=${holes}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setRows(d.leaderboard ?? []));
  }, [season, scope, holes]);

  const holesLabel = holes === "all" ? "" : `${holes}-hole `;

  // The scope + holes filter pills stay mounted in every state (loading, empty,
  // populated) so an empty filter — e.g. 9H with no 9-hole rounds — never strands
  // the user without a way to switch back. Only the list area below swaps out.
  const filterChips = (
    <div className="no-scrollbar mb-3 flex items-center gap-2 overflow-x-auto">
      <V2Pill active={scope === "mine"} onClick={() => setScope("mine")}>
        My circle
      </V2Pill>
      <V2Pill active={scope === "all"} onClick={() => setScope("all")}>
        Everyone
      </V2Pill>
      <span aria-hidden="true" className="mx-1 h-4 w-px bg-[var(--v2-gold)]/15" />
      {(["18", "9", "all"] as const).map((h) => (
        <V2Pill key={h} active={holes === h} onClick={() => setHoles(h)}>
          {h === "all" ? "All" : `${h}H`}
        </V2Pill>
      ))}
    </div>
  );

  if (rows === null) {
    return (
      <div>
        {filterChips}
        <V2Card>
          <div className="py-6 text-center text-[var(--v2-text-dim)]">
            Loading…
          </div>
        </V2Card>
      </div>
    );
  }
  if (
    rows.length === 0 ||
    (rows.length === 1 && rows[0].rounds_played === 0)
  ) {
    return (
      <div>
        {filterChips}
        <V2Card>
          <div className="py-6 text-center text-sm text-[var(--v2-text-dim)]">
            {scope === "mine"
              ? `You haven't played a ${holesLabel}round in this filter yet.`
              : `No ${holesLabel}rounds logged in this filter yet.`}
          </div>
        </V2Card>
      </div>
    );
  }

  // Sort by chosen metric. Strict, since ties are common — fall back to points
  // so podium ranking stays stable as users flip the toggle.
  const sortedRows = rows.slice().sort((a, b) => {
    if (metric === "avg") {
      // Lower is better. Ignore zeros (no rounds).
      const aAvg = a.avg_score || 999;
      const bAvg = b.avg_score || 999;
      if (aAvg !== bAvg) return aAvg - bAvg;
    } else if (metric === "wins") {
      if (a.wins !== b.wins) return b.wins - a.wins;
    } else if (metric === "best") {
      const aBest = a.best_score || 999;
      const bBest = b.best_score || 999;
      if (aBest !== bBest) return aBest - bBest;
    } else {
      if (a.points !== b.points) return b.points - a.points;
    }
    // tiebreaker: points DESC, then rounds_played DESC
    if (a.points !== b.points) return b.points - a.points;
    return b.rounds_played - a.rounds_played;
  });

  // Compute display ranks with ties.
  type Display = LeaderboardRow & { rank: number; tied: boolean };
  const display: Display[] = [];
  let lastKey: string | null = null;
  let lastRank = 0;
  sortedRows.forEach((row, i) => {
    const key = metricKey(row, metric);
    const tied = lastKey != null && key === lastKey;
    if (!tied) lastRank = i + 1;
    display.push({ ...row, rank: lastRank, tied });
    lastKey = key;
  });
  // Mark tie groups so the row knows to T-prefix.
  const rankCounts = new Map<number, number>();
  for (const r of display) {
    rankCounts.set(r.rank, (rankCounts.get(r.rank) ?? 0) + 1);
  }

  const minAvg = Math.min(
    ...display.filter((r) => r.avg_score > 0).map((r) => r.avg_score),
  );

  return (
    <div>
      {filterChips}

      {/* Metric sort */}
      <div className="mb-2 flex items-center gap-2">
        <div className="flex-1">
          <V2SegmentedControl
            value={metric}
            onChange={setMetric}
            options={[
              { value: "points", label: "Points" },
              { value: "avg", label: "Avg" },
              { value: "wins", label: "Wins" },
              { value: "best", label: "Best" },
            ]}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowPointsHelp((v) => !v)}
          aria-label="How points work"
          aria-expanded={showPointsHelp}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
            showPointsHelp
              ? "bg-[var(--v2-gold)]/20 text-[var(--v2-gold)]"
              : "bg-[var(--v2-surface-2)] text-[var(--v2-text-dim)]"
          }`}
        >
          ?
        </button>
      </div>
      {showPointsHelp && (
        <div className="mb-4 rounded-lg border border-[var(--v2-gold)]/20 bg-[var(--v2-gold)]/8 px-3 py-2 text-xs leading-relaxed text-[var(--v2-text-dim)]">
          <strong className="text-[var(--v2-text)]">Points</strong>: each round of N
          players awards N pts for 1st, N−1 for 2nd, … 1 for last. Solo rounds award
          nothing.
          <br />
          <strong className="text-[var(--v2-text)]">Ties</strong>: tied players share the
          higher place (e.g. two tied for 1st both get N pts; next player is 3rd).{" "}
          <em>(Nt)</em> next to a place count means N of those finishes were ties.
        </div>
      )}

      {/* Podium — top 3 (spec §7.3, optional) */}
      {display.length >= 3 && <Podium top={display.slice(0, 3)} metric={metric} />}

      {/* Ranked rows */}
      <div>
        {display.map((row) => {
          const meta = `${row.rounds_played} rounds · ${row.wins} ${
            row.wins === 1 ? "win" : "wins"
          } · best ${row.best_score || "—"}`;
          const tiedRow = (rankCounts.get(row.rank) ?? 0) > 1;
          const isYou = !row.is_guest && row.user_id === user?.id;
          const isLeader = row.rank === 1 && !tiedRow;
          // Color the avg sage if it's the leader-of-the-pack lowest, amber if
          // notably higher than the pack leader (>= +5 strokes).
          const primaryTone: "sage" | "amber" | "white" =
            metric === "avg"
              ? row.avg_score === minAvg
                ? "sage"
                : row.avg_score - minAvg >= 5
                  ? "amber"
                  : "white"
              : "white";
          const primaryValue =
            metric === "avg"
              ? row.avg_score || "—"
              : metric === "wins"
                ? row.wins
                : metric === "best"
                  ? row.best_score || "—"
                  : row.points;
          const primaryLabel =
            metric === "avg"
              ? "avg"
              : metric === "wins"
                ? "wins"
                : metric === "best"
                  ? "best"
                  : "pts";
          const hasPlacements =
            row.firsts > 0 || row.seconds > 0 || row.thirds > 0 || row.fourths > 0;
          const expanded = expandedKey === row.key;
          return (
            <div key={row.key}>
              <V2LeaderboardRow
                rank={row.rank}
                tied={tiedRow}
                isYou={isYou}
                isLeader={isLeader}
                name={row.name}
                meta={meta}
                chips={hasPlacements ? <PlacementChips row={row} /> : undefined}
                primaryValue={primaryValue}
                primaryLabel={primaryLabel}
                primaryTone={primaryTone}
                secondaryValue={metric === "points" ? row.avg_score || "—" : row.points}
                secondaryLabel={metric === "points" ? "avg" : "pts"}
                expandable
                expanded={expanded}
                onClick={() => setExpandedKey((k) => (k === row.key ? null : row.key))}
              />
              {expanded && <HoleStatsPanel row={row} />}
            </div>
          );
        })}
      </div>

      {/* Score Trends chart */}
      {rows.some((r) => r.series.length > 0) && (
        <div className="mt-6">
          <V2SectionTitle>Score Trends</V2SectionTitle>
          <V2Card>
            <ScoreTrendChart rows={rows} />
          </V2Card>
        </div>
      )}
    </div>
  );
}

type DisplayRow = LeaderboardRow & { rank: number; tied: boolean };

function metricValue(row: LeaderboardRow, metric: Metric): React.ReactNode {
  switch (metric) {
    case "avg":
      return row.avg_score || "—";
    case "wins":
      return row.wins;
    case "best":
      return row.best_score || "—";
    case "points":
      return row.points;
  }
}

function metricLabel(metric: Metric): string {
  return metric === "avg" ? "avg" : metric === "wins" ? "wins" : metric === "best" ? "best" : "pts";
}

function Podium({ top, metric }: { top: DisplayRow[]; metric: Metric }) {
  const [first, second, third] = top;
  const label = metricLabel(metric);
  return (
    <div className="mb-5 flex items-end justify-center gap-2">
      {second && <PodiumSpot row={second} place={2} metric={metric} label={label} />}
      {first && <PodiumSpot row={first} place={1} metric={metric} label={label} />}
      {third && <PodiumSpot row={third} place={3} metric={metric} label={label} />}
    </div>
  );
}

function PodiumSpot({
  row,
  place,
  metric,
  label,
}: {
  row: DisplayRow;
  place: 1 | 2 | 3;
  metric: Metric;
  label: string;
}) {
  const size = place === 1 ? 62 : 50;
  const pedestalH = place === 1 ? "h-16" : place === 2 ? "h-12" : "h-10";
  const pedestalBg =
    place === 1
      ? "from-[var(--v2-gold)]/30 to-[var(--v2-gold)]/5 border-[var(--v2-gold)]/40"
      : place === 2
        ? "from-[var(--v2-silver)]/25 to-transparent border-[var(--v2-silver)]/30"
        : "from-[var(--v2-bronze)]/25 to-transparent border-[var(--v2-bronze)]/30";
  const numColor =
    place === 1
      ? "text-[var(--v2-gold)]"
      : place === 2
        ? "text-[var(--v2-silver)]"
        : "text-[var(--v2-bronze)]";
  const initial = (row.name.charAt(0) || "?").toUpperCase();
  return (
    <div className="flex w-[30%] max-w-[120px] flex-col items-center">
      {place === 1 ? (
        <V2Avatar initial={initial} leader size={size} />
      ) : (
        <V2Avatar initial={initial} tone={place === 2 ? "silver" : "bronze"} size={size} />
      )}
      <div className="mt-1.5 w-full truncate text-center text-[11px] font-medium text-[var(--v2-text)]">
        {row.name}
      </div>
      <div
        className="leading-none text-[var(--v2-gold)]"
        style={{
          fontFamily: "var(--font-fraunces), Georgia, serif",
          fontSize: place === 1 ? "20px" : "16px",
          fontWeight: 600,
        }}
      >
        {metricValue(row, metric)}
      </div>
      <div className="text-[8px] text-[var(--v2-text-faint)]">{label}</div>
      <div
        className={`mt-1.5 flex w-full items-start justify-center rounded-t-lg border-x border-t bg-gradient-to-b pt-1 ${pedestalBg} ${pedestalH}`}
      >
        <span
          className={`text-base font-bold ${numColor}`}
          style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
        >
          {row.tied ? `T${row.rank}` : place}
        </span>
      </div>
    </div>
  );
}

function metricKey(row: LeaderboardRow, metric: Metric): string {
  switch (metric) {
    case "avg":
      return String(row.avg_score);
    case "wins":
      return String(row.wins);
    case "best":
      return String(row.best_score);
    case "points":
      return String(row.points);
  }
}

function PlacementChips({ row }: { row: LeaderboardRow }) {
  const items = [
    { label: "1st", n: row.firsts, tied: row.firsts_tied, cls: "bg-[var(--v2-gold)]/20 text-[var(--v2-gold)]" },
    { label: "2nd", n: row.seconds, tied: row.seconds_tied, cls: "bg-[var(--v2-silver)]/22 text-[var(--v2-silver)]" },
    { label: "3rd", n: row.thirds, tied: row.thirds_tied, cls: "bg-[var(--v2-bronze)]/22 text-[var(--v2-bronze)]" },
    { label: "💩", n: row.fourths, tied: row.fourths_tied, cls: "bg-[var(--v2-amber-warn)]/15 text-[var(--v2-amber-warn)]" },
  ];
  return (
    <>
      {items
        .filter((i) => i.n > 0)
        .map((i) => (
          <span
            key={i.label}
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${i.cls}`}
            style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
          >
            {i.label} {i.n}
            {i.tied > 0 ? ` (${i.tied}t)` : ""}
          </span>
        ))}
    </>
  );
}

function HoleStatsPanel({ row }: { row: LeaderboardRow }) {
  const hs = row.hole_stats;
  if (!hs || hs.holes_scored === 0) {
    return (
      <div className="-mt-1 mb-2 px-1">
        <div className="v2-card text-xs text-[var(--v2-text-dim)]">
          No hole-by-hole data this season.{" "}
          <Link href="/rounds/new" className="text-[var(--v2-gold)] hover:underline">
            Upload a scorecard
          </Link>{" "}
          to track birdies, pars, and more.
        </div>
      </div>
    );
  }
  return (
    <div className="-mt-1 mb-2 px-1">
      <div className="v2-card">
        <div className="mb-1.5 text-[10px] uppercase tracking-wide text-[var(--v2-text-dim)]">
          Hole stats · {hs.holes_scored} holes
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
          <span className="rounded bg-[var(--v2-gold)]/20 px-2 py-0.5 text-[var(--v2-gold-bright)]">🦅 {hs.eagles}</span>
          <span className="rounded bg-red-500/20 px-2 py-0.5 text-red-300">Birdies {hs.birdies}</span>
          <span className="rounded bg-[var(--v2-sage)]/18 px-2 py-0.5 text-[var(--v2-score-soft)]">Pars {hs.pars}</span>
          <span className="rounded bg-blue-500/20 px-2 py-0.5 text-blue-300">Bogeys {hs.bogeys}</span>
          <span className="rounded bg-blue-700/35 px-2 py-0.5 text-blue-200">2+ {hs.doubles_plus}</span>
        </div>
      </div>
    </div>
  );
}

function SeasonFilter({
  season,
  onChange,
}: {
  season: number | "all";
  onChange: (s: number | "all") => void;
}) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4];

  return (
    <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto">
      <V2Pill active={season === "all"} onClick={() => onChange("all")}>
        All Time
      </V2Pill>
      {years.map((y) => (
        <V2Pill key={y} active={season === y} onClick={() => onChange(y)}>
          {String(y)}
        </V2Pill>
      ))}
    </div>
  );
}

function seasonParam(season: number | "all") {
  return season === "all" ? "" : `&season=${season}`;
}

function FunTab({ season }: { season: number | "all" }) {
  const [data, setData] = useState<FunStats | null>(null);

  useEffect(() => {
    setData(null);
    fetch(`/api/stats/fun?${season === "all" ? "" : `season=${season}`}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setData(d));
  }, [season]);

  if (!data) {
    return (
      <V2Card>
        <div className="py-6 text-center text-[var(--v2-muted)]">Loading…</div>
      </V2Card>
    );
  }

  const noData =
    !data.lowest_round && !data.biggest_blowout && !data.most_played_pair;
  if (noData) {
    return (
      <V2Card>
        <div className="py-6 text-center text-sm text-[var(--v2-muted)]">
          Not enough rounds logged yet.
        </div>
      </V2Card>
    );
  }

  return (
    <div className="space-y-4">
      {data.lowest_round && (
        <Link href={`/rounds/${data.lowest_round.round_id}`} className="block">
          <V2Card>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-base font-bold text-white">
                  Lowest Round
                </div>
                <div className="mt-2 text-4xl font-bold text-[var(--v2-score)]">
                  {data.lowest_round.gross_score}
                </div>
                <div className="mt-2 text-xs text-[var(--v2-muted)]">
                  {data.lowest_round.course_name} ·{" "}
                  {formatDate(data.lowest_round.played_at)}
                </div>
              </div>
              <div className="text-right text-sm font-semibold text-[var(--v2-accent)]">
                {data.lowest_round.name}
              </div>
            </div>
          </V2Card>
        </Link>
      )}

      {data.biggest_blowout && (
        <Link
          href={`/rounds/${data.biggest_blowout.round_id}`}
          className="block"
        >
          <V2Card>
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold text-white">
                  Biggest Blowout
                </div>
                <div className="mt-2 text-4xl font-bold text-[var(--v2-score)]">
                  {data.biggest_blowout.margin}
                </div>
                <div className="text-xs text-[var(--v2-muted)]">strokes</div>
                <div className="mt-2 text-xs text-[var(--v2-muted)]">
                  <span className="text-white">
                    {data.biggest_blowout.winner_name}
                  </span>{" "}
                  ({data.biggest_blowout.winner_score}) over{" "}
                  <span className="text-white">
                    {data.biggest_blowout.runner_up_name}
                  </span>{" "}
                  ({data.biggest_blowout.runner_up_score})
                </div>
              </div>
              <div className="text-right text-sm font-semibold text-[var(--v2-accent)]">
                {data.biggest_blowout.margin} Strokes
              </div>
            </div>
          </V2Card>
        </Link>
      )}

      {data.most_played_pair && (
        <V2Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-base font-bold text-white">
                Most Rounds Together
              </div>
              <div className="mt-2 text-4xl font-bold text-[var(--v2-score)]">
                {data.most_played_pair.rounds_together}
              </div>
              <div className="mt-2 text-xs text-[var(--v2-muted)]">
                <span className="text-white">
                  {data.most_played_pair.a_name}
                </span>{" "}
                &amp;{" "}
                <span className="text-white">
                  {data.most_played_pair.b_name}
                </span>
              </div>
            </div>
            <div className="text-right text-sm font-semibold text-[var(--v2-accent)]">
              Rounds
            </div>
          </div>
        </V2Card>
      )}
    </div>
  );
}

function H2HTab({ season }: { season: number | "all" }) {
  const [aKey, setAKey] = useState<string | null>(null);
  const [bKey, setBKey] = useState<string | null>(null);
  const [data, setData] = useState<H2HResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (a: string, b: string, s: number | "all") => {
      setLoading(true);
      setError(null);
      setData(null);
      try {
        const res = await fetch(
          `/api/h2h?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}${seasonParam(s)}`,
          { cache: "no-store" },
        );
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? "Failed");
        setData(d as H2HResult);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (aKey && bKey && aKey !== bKey) load(aKey, bKey, season);
  }, [aKey, bKey, season, load]);

  return (
    <>
      <V2Card className="mb-4 space-y-3">
        <PlayerPicker
          variant="v2"
          label="Player A"
          value={aKey}
          excludeKey={bKey}
          onChange={(k) => setAKey(k)}
        />
        <PlayerPicker
          variant="v2"
          label="Player B"
          value={bKey}
          excludeKey={aKey}
          onChange={(k) => setBKey(k)}
        />
      </V2Card>

      {!aKey || !bKey ? (
        <V2Card>
          <div className="py-6 text-center text-sm text-[var(--v2-muted)]">
            Pick two players to see their head-to-head record.
          </div>
        </V2Card>
      ) : loading ? (
        <V2Card>
          <div className="py-6 text-center text-[var(--v2-muted)]">
            Loading…
          </div>
        </V2Card>
      ) : error ? (
        <V2Card>
          <div className="py-3 text-sm text-red-300">{error}</div>
        </V2Card>
      ) : data && data.rounds_played === 0 ? (
        <V2Card>
          <div className="py-6 text-center text-sm text-[var(--v2-muted)]">
            {data.a.name} and {data.b.name} haven&apos;t played
            {season === "all"
              ? " a round together"
              : ` together in ${season}`}{" "}
            yet.
          </div>
        </V2Card>
      ) : data ? (
        <>
          <V2Card className="mb-4">
            <div className="grid grid-cols-3 gap-2">
              <V2StatTile
                label={data.a.name}
                value={data.a_wins}
                tone="green"
              />
              <V2StatTile label="Ties" value={data.ties} tone="white" />
              <V2StatTile
                label={data.b.name}
                value={data.b_wins}
                tone="green"
              />
            </div>
            <div className="mt-3 text-center text-xs text-[var(--v2-muted)]">
              {data.rounds_played} rounds together
            </div>
          </V2Card>

          <V2SectionTitle>History</V2SectionTitle>
          <div className="space-y-2">
            {data.history.map((h) => {
              const aWon = h.a_score < h.b_score;
              const bWon = h.b_score < h.a_score;
              return (
                <Link
                  key={h.round_id}
                  href={`/rounds/${h.round_id}`}
                  className="block"
                >
                  <V2Card className="!p-3">
                    <div className="mb-1 flex items-center justify-between text-xs text-[var(--v2-muted)]">
                      <span className="truncate">{h.course_name}</span>
                      <span>{formatDate(h.played_at)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div
                        className={
                          aWon
                            ? "font-bold text-[var(--v2-score)]"
                            : "text-white"
                        }
                      >
                        {data.a.name}: {h.a_score}
                      </div>
                      <div className="px-2 text-xs text-[var(--v2-muted)]">
                        {aWon ? "▶" : bWon ? "◀" : "tie"}
                      </div>
                      <div
                        className={
                          bWon
                            ? "font-bold text-[var(--v2-score)]"
                            : "text-white"
                        }
                      >
                        {data.b.name}: {h.b_score}
                      </div>
                    </div>
                  </V2Card>
                </Link>
              );
            })}
          </div>
        </>
      ) : null}
    </>
  );
}

function PlayerTab({ season }: { season: number | "all" }) {
  const [key, setKey] = useState<string | null>(null);
  const [data, setData] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (k: string, s: number | "all") => {
    setLoading(true);
    setData(null);
    const res = await fetch(
      `/api/player?key=${encodeURIComponent(k)}${seasonParam(s)}`,
      { cache: "no-store" },
    );
    const d = await res.json();
    setData(d as PlayerStats);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (key) load(key, season);
  }, [key, season, load]);

  return (
    <>
      <V2Card className="mb-4">
        <PlayerPicker
          variant="v2"
          label="Player"
          value={key}
          onChange={(k) => setKey(k)}
        />
      </V2Card>

      {!key ? (
        <V2Card>
          <div className="py-6 text-center text-sm text-[var(--v2-muted)]">
            Pick a player to see their stats.
          </div>
        </V2Card>
      ) : loading ? (
        <V2Card>
          <div className="py-6 text-center text-[var(--v2-muted)]">
            Loading…
          </div>
        </V2Card>
      ) : data && data.rounds_played === 0 ? (
        <V2Card>
          <div className="py-6 text-center text-sm text-[var(--v2-muted)]">
            {data.name} hasn&apos;t played
            {season === "all" ? " any rounds" : ` any rounds in ${season}`} yet.
          </div>
        </V2Card>
      ) : data ? (
        <>
          <V2Card className="mb-4">
            <div className="mb-3 flex items-center gap-2 text-lg font-bold text-white">
              {data.name}
            </div>
            {!data.is_guest && (
              <div className="mb-3 flex items-center justify-between rounded-lg bg-[var(--v2-surface-2)] px-3 py-2">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--v2-accent)]">
                    Handicap index
                  </div>
                  <div className="text-xs text-[var(--v2-muted)]">
                    {data.handicap_index == null
                      ? `Need ${Math.max(0, 3 - data.handicap_rounds_used)} more eligible round${data.handicap_rounds_used === 2 ? "" : "s"}`
                      : `Best of last ${data.handicap_rounds_used} round${data.handicap_rounds_used === 1 ? "" : "s"}`}
                  </div>
                </div>
                <div className="text-2xl font-bold text-[var(--v2-accent)]">
                  {data.handicap_index ?? "—"}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <V2StatTile
                label="Rounds"
                value={data.rounds_played}
                tone="white"
              />
              <V2StatTile
                label="Wins"
                value={data.total_wins}
                tone="green"
              />
            </div>
            {data.rounds_played_18 > 0 && (
              <div className="mt-3 border-t border-[var(--v2-border)] pt-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--v2-muted)]">
                  18 holes
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <V2StatTile
                    label="Rounds"
                    value={data.rounds_played_18}
                    tone="white"
                  />
                  <V2StatTile
                    label="Avg"
                    value={data.avg_score_18 ?? "—"}
                    tone="gold"
                  />
                  <V2StatTile
                    label="Best"
                    value={data.best_score_18 ?? "—"}
                    tone="green"
                  />
                </div>
              </div>
            )}
            {data.rounds_played_9 > 0 && (
              <div className="mt-3 border-t border-[var(--v2-border)] pt-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--v2-muted)]">
                  9 holes
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <V2StatTile
                    label="Rounds"
                    value={data.rounds_played_9}
                    tone="white"
                  />
                  <V2StatTile
                    label="Avg"
                    value={data.avg_score_9 ?? "—"}
                    tone="gold"
                  />
                  <V2StatTile
                    label="Best"
                    value={data.best_score_9 ?? "—"}
                    tone="green"
                  />
                </div>
              </div>
            )}
          </V2Card>

          {data.recent.length > 0 && (
            <>
              <V2SectionTitle>All rounds</V2SectionTitle>
              <div className="mb-4 space-y-2">
                {data.recent.map((r) => (
                  <Link
                    key={r.round_id}
                    href={`/rounds/${r.round_id}`}
                    className="block"
                  >
                    <V2Card className="flex items-center justify-between !p-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-white">
                          {r.course_name}
                        </div>
                        <div className="text-xs text-[var(--v2-muted)]">
                          {formatDate(r.played_at)}
                          {r.placement && r.field_size > 1
                            ? ` · ${ordinal(r.placement)} of ${r.field_size}`
                            : ""}
                        </div>
                      </div>
                      <div className="ml-2 text-2xl font-bold text-[var(--v2-score)]">
                        {r.gross_score}
                      </div>
                    </V2Card>
                  </Link>
                ))}
              </div>
            </>
          )}

          {data.by_course.length > 0 && (
            <>
              <V2SectionTitle>By course</V2SectionTitle>
              <div className="space-y-2">
                {data.by_course.map((c) => (
                  <Link
                    key={c.course_id}
                    href={`/courses/${c.course_id}`}
                    className="block"
                  >
                    <V2Card className="flex items-center justify-between !p-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-white">
                          {c.course_name}
                        </div>
                        <div className="text-xs text-[var(--v2-muted)]">
                          {c.rounds_played} rounds · best {c.best_score}
                        </div>
                      </div>
                      <div className="ml-2 text-xl font-bold text-[var(--v2-accent)]">
                        {c.avg_score}
                      </div>
                    </V2Card>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      ) : null}
    </>
  );
}

function formatDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
