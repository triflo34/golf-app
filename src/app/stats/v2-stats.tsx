"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PlayerPicker } from "@/components/player-picker";
import { V2PageShell } from "@/components/v2/page-shell";
import { V2Card } from "@/components/v2/card";
import { V2Pill } from "@/components/v2/pill";
import { V2StatTile } from "@/components/v2/stat-tile";
import { V2SectionTitle } from "@/components/v2/section-title";
import type { H2HResult } from "@/app/api/h2h/route";
import type { PlayerStats } from "@/app/api/player/route";
import type { FunStats } from "@/app/api/stats/fun/route";

type Tab = "h2h" | "player" | "fun";

export function V2Stats() {
  const [tab, setTab] = useState<Tab>("h2h");
  const [season, setSeason] = useState<number | "all">("all");

  return (
    <V2PageShell>
      <div className="mb-4 flex items-center justify-center gap-6 border-b border-[var(--v2-border)] pb-2">
        <TabButton active={tab === "h2h"} onClick={() => setTab("h2h")}>
          H2H
        </TabButton>
        <TabButton
          active={tab === "player"}
          onClick={() => setTab("player")}
        >
          Player
        </TabButton>
        <TabButton active={tab === "fun"} onClick={() => setTab("fun")}>
          Highlights
        </TabButton>
      </div>

      <SeasonFilter season={season} onChange={setSeason} />

      {tab === "h2h" ? (
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
      className={`relative pb-2 text-sm font-semibold transition ${
        active ? "text-white" : "text-[var(--v2-muted)] hover:text-white"
      }`}
    >
      {children}
      {active && (
        <span className="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full bg-[var(--v2-accent)]" />
      )}
    </button>
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
            <div className="grid grid-cols-4 gap-2">
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
              <V2StatTile
                label="Avg"
                value={data.avg_score ?? "—"}
                tone="gold"
              />
              <V2StatTile
                label="Best"
                value={data.best_score ?? "—"}
                tone="green"
              />
            </div>
          </V2Card>

          {data.recent.length > 0 && (
            <>
              <V2SectionTitle>Recent rounds</V2SectionTitle>
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
