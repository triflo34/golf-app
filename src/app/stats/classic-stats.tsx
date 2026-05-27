"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PlayerPicker } from "@/components/player-picker";
import type { H2HResult } from "@/app/api/h2h/route";
import type { PlayerStats } from "@/app/api/player/route";
import type { FunStats } from "@/app/api/stats/fun/route";

type Tab = "h2h" | "player" | "fun";

export function ClassicStats() {
  const [tab, setTab] = useState<Tab>("h2h");
  const [season, setSeason] = useState<number | "all">("all");

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-green-800 mb-4">Stats</h1>

      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setTab("h2h")}
          className={`flex-1 py-2 rounded-lg font-medium text-sm transition ${
            tab === "h2h"
              ? "bg-green-700 text-white"
              : "bg-white text-gray-600 border border-gray-200"
          }`}
        >
          H2H
        </button>
        <button
          onClick={() => setTab("player")}
          className={`flex-1 py-2 rounded-lg font-medium text-sm transition ${
            tab === "player"
              ? "bg-green-700 text-white"
              : "bg-white text-gray-600 border border-gray-200"
          }`}
        >
          Player
        </button>
        <button
          onClick={() => setTab("fun")}
          className={`flex-1 py-2 rounded-lg font-medium text-sm transition ${
            tab === "fun"
              ? "bg-green-700 text-white"
              : "bg-white text-gray-600 border border-gray-200"
          }`}
        >
          Highlights
        </button>
      </div>

      <SeasonFilter season={season} onChange={setSeason} />

      {tab === "h2h" ? (
        <H2HTab season={season} />
      ) : tab === "player" ? (
        <PlayerTab season={season} />
      ) : (
        <FunTab season={season} />
      )}
    </div>
  );
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
    return <div className="card text-center py-8 text-gray-400">Loading...</div>;
  }

  const noData =
    !data.lowest_round && !data.biggest_blowout && !data.most_played_pair;
  if (noData) {
    return (
      <div className="card text-center py-8 text-gray-400 text-sm">
        Not enough rounds logged yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.lowest_round && (
        <Link
          href={`/rounds/${data.lowest_round.round_id}`}
          className="card block hover:bg-green-50 transition"
        >
          <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
            Lowest round
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="text-3xl font-bold text-green-700">
              {data.lowest_round.gross_score}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-800 truncate flex items-center gap-1.5">
                {data.lowest_round.name}
                {data.lowest_round.is_guest && (
                  <span className="text-[10px] font-semibold text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">
                    guest
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {data.lowest_round.course_name} · {formatDate(data.lowest_round.played_at)}
              </div>
            </div>
          </div>
        </Link>
      )}

      {data.biggest_blowout && (
        <Link
          href={`/rounds/${data.biggest_blowout.round_id}`}
          className="card block hover:bg-green-50 transition"
        >
          <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
            Biggest blowout
          </div>
          <div className="mt-1">
            <div className="text-3xl font-bold text-green-700">
              {data.biggest_blowout.margin} strokes
            </div>
            <div className="text-sm text-gray-700 mt-1">
              <span className="font-semibold">{data.biggest_blowout.winner_name}</span>{" "}
              ({data.biggest_blowout.winner_score}) over{" "}
              <span className="font-semibold">{data.biggest_blowout.runner_up_name}</span>{" "}
              ({data.biggest_blowout.runner_up_score})
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {data.biggest_blowout.course_name} · {formatDate(data.biggest_blowout.played_at)}
            </div>
          </div>
        </Link>
      )}

      {data.most_played_pair && (
        <div className="card">
          <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
            Most rounds together
          </div>
          <div className="mt-1">
            <div className="text-lg font-bold text-gray-800">
              {data.most_played_pair.a_name} &amp; {data.most_played_pair.b_name}
            </div>
            <div className="text-sm text-green-700 font-semibold">
              {data.most_played_pair.rounds_together} rounds
            </div>
          </div>
        </div>
      )}
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
  const years = [currentYear, currentYear - 1, currentYear - 2];

  return (
    <div className="flex gap-1.5 mb-4 overflow-x-auto">
      <button
        onClick={() => onChange("all")}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
          season === "all"
            ? "bg-green-700 text-white"
            : "bg-white text-gray-600 border border-gray-200"
        }`}
      >
        All time
      </button>
      {years.map((y) => (
        <button
          key={y}
          onClick={() => onChange(y)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
            season === y
              ? "bg-green-700 text-white"
              : "bg-white text-gray-600 border border-gray-200"
          }`}
        >
          {y}
        </button>
      ))}
    </div>
  );
}

function seasonParam(season: number | "all") {
  return season === "all" ? "" : `&season=${season}`;
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
      <div className="card mb-4 space-y-3">
        <PlayerPicker
          label="Player A"
          value={aKey}
          excludeKey={bKey}
          onChange={(k) => setAKey(k)}
        />
        <PlayerPicker
          label="Player B"
          value={bKey}
          excludeKey={aKey}
          onChange={(k) => setBKey(k)}
        />
      </div>

      {!aKey || !bKey ? (
        <div className="card text-center py-8 text-gray-400 text-sm">
          Pick two players to see their head-to-head record.
        </div>
      ) : loading ? (
        <div className="card text-center py-8 text-gray-400">Loading...</div>
      ) : error ? (
        <div className="card bg-red-50 text-red-600 text-sm">{error}</div>
      ) : data && data.rounds_played === 0 ? (
        <div className="card text-center py-8 text-gray-400 text-sm">
          {data.a.name} and {data.b.name} haven&apos;t played
          {season === "all" ? " a round together" : ` together in ${season}`} yet.
        </div>
      ) : data ? (
        <>
          <div className="card mb-4">
            <div className="grid grid-cols-3 text-center gap-2">
              <div>
                <div className="text-3xl font-bold text-green-700">
                  {data.a_wins}
                </div>
                <div className="text-xs text-gray-500 mt-1 truncate">
                  {data.a.name}
                </div>
              </div>
              <div>
                <div className="text-3xl font-bold text-gray-500">
                  {data.ties}
                </div>
                <div className="text-xs text-gray-500 mt-1">ties</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-green-700">
                  {data.b_wins}
                </div>
                <div className="text-xs text-gray-500 mt-1 truncate">
                  {data.b.name}
                </div>
              </div>
            </div>
            <div className="text-center text-xs text-gray-400 mt-3">
              {data.rounds_played} rounds together
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-2 text-sm">History</h3>
            <div className="space-y-2">
              {data.history.map((h) => {
                const aWon = h.a_score < h.b_score;
                const bWon = h.b_score < h.a_score;
                return (
                  <Link
                    key={h.round_id}
                    href={`/rounds/${h.round_id}`}
                    className="block bg-gray-50 rounded-lg p-2.5 hover:bg-green-50"
                  >
                    <div className="flex justify-between items-center text-xs text-gray-500 mb-1">
                      <span className="truncate">{h.course_name}</span>
                      <span>{formatDate(h.played_at)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className={aWon ? "font-bold text-green-700" : ""}>
                        {data.a.name}: {h.a_score}
                      </div>
                      <div
                        className={`text-xs px-2 ${
                          aWon || bWon
                            ? "text-gray-400"
                            : "text-gray-500 font-semibold"
                        }`}
                      >
                        {aWon ? "▶" : bWon ? "◀" : "tie"}
                      </div>
                      <div className={bWon ? "font-bold text-green-700" : ""}>
                        {data.b.name}: {h.b_score}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
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
      <div className="card mb-4">
        <PlayerPicker label="Player" value={key} onChange={(k) => setKey(k)} />
      </div>

      {!key ? (
        <div className="card text-center py-8 text-gray-400 text-sm">
          Pick a player to see their stats.
        </div>
      ) : loading ? (
        <div className="card text-center py-8 text-gray-400">Loading...</div>
      ) : data && data.rounds_played === 0 ? (
        <div className="card text-center py-8 text-gray-400 text-sm">
          {data.name} hasn&apos;t played
          {season === "all" ? " any rounds" : ` any rounds in ${season}`} yet.
        </div>
      ) : data ? (
        <>
          <div className="card mb-4">
            <div className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
              {data.name}
              {data.is_guest && (
                <span className="text-[10px] font-semibold text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">
                  guest
                </span>
              )}
            </div>
            {!data.is_guest && (
              <div className="mb-3 flex items-center justify-between bg-green-50 rounded-lg px-3 py-2">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-green-700">
                    Handicap index
                  </div>
                  <div className="text-xs text-gray-500">
                    {data.handicap_index == null
                      ? `Need ${Math.max(0, 3 - data.handicap_rounds_used)} more eligible round${data.handicap_rounds_used === 2 ? "" : "s"}`
                      : `Based on best of last ${data.handicap_rounds_used} round${data.handicap_rounds_used === 1 ? "" : "s"}`}
                  </div>
                </div>
                <div className="text-2xl font-bold text-green-700">
                  {data.handicap_index ?? "—"}
                </div>
              </div>
            )}
            <div className="grid grid-cols-4 text-center gap-2">
              <Stat label="rounds" value={data.rounds_played} />
              <Stat label="wins" value={data.total_wins} />
              <Stat label="avg" value={data.avg_score ?? "—"} />
              <Stat label="best" value={data.best_score ?? "—"} />
            </div>
          </div>

          {data.recent.length > 0 && (
            <div className="card mb-4">
              <h3 className="font-semibold text-gray-800 mb-2 text-sm">
                Recent rounds
              </h3>
              <div className="space-y-2">
                {data.recent.map((r) => (
                  <Link
                    key={r.round_id}
                    href={`/rounds/${r.round_id}`}
                    className="block bg-gray-50 rounded-lg p-2.5 flex justify-between items-center hover:bg-green-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-800 truncate">
                        {r.course_name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatDate(r.played_at)}
                        {r.placement && r.field_size > 1
                          ? ` · ${ordinal(r.placement)} of ${r.field_size}`
                          : ""}
                      </div>
                    </div>
                    <div className="text-lg font-bold text-green-700 ml-2">
                      {r.gross_score}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {data.by_course.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-800 mb-2 text-sm">
                By course
              </h3>
              <div className="space-y-1.5">
                {data.by_course.map((c) => (
                  <Link
                    key={c.course_id}
                    href={`/courses/${c.course_id}`}
                    className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2 hover:bg-green-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-800 truncate">
                        {c.course_name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {c.rounds_played} rounds · best {c.best_score}
                      </div>
                    </div>
                    <div className="text-base font-bold text-green-700 ml-2">
                      {c.avg_score}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-xl font-bold text-green-700">{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
    </div>
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
