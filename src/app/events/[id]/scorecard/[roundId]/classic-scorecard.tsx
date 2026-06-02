"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";

type RoundInfo = {
  id: number;
  course_id: number;
  event_id: number;
  round_number: number;
  round_format: "individual" | "scramble";
  hole_count: number;
  played_at: string;
};

type HolePar = {
  hole_number: number;
  par: number;
  handicap_index: number | null;
  yardage: number | null;
};

type PlayerInfo = {
  user_id: string;
  display_name: string;
  group_num: number | null;
};

type ScoreInfo = {
  id: number;
  player_id: string;
  hole_number: number;
  strokes: number;
};

type TeamInfo = {
  id: number;
  name: string;
  members: { team_id: number; user_id: string; display_name: string }[];
};

type TeamScoreInfo = {
  id: number;
  team_id: number;
  hole_number: number;
  strokes: number;
};

type RoundLoad = {
  round: RoundInfo;
  holes: HolePar[];
  players: PlayerInfo[];
  scores: ScoreInfo[];
  teams: TeamInfo[];
  team_scores: TeamScoreInfo[];
};

function cellTone(strokes: number | null, par: number): string {
  if (strokes == null) return "text-gray-300";
  const d = strokes - par;
  if (d <= -2) return "bg-yellow-100 text-yellow-800 font-bold";
  if (d === -1) return "bg-red-100 text-red-700 font-bold";
  if (d === 0) return "bg-green-50 text-green-800";
  if (d === 1) return "bg-blue-50 text-blue-700";
  if (d === 2) return "bg-blue-100 text-blue-900 font-semibold";
  return "bg-gray-200 text-gray-800 font-semibold";
}

export function ClassicEventScorecard({ id, roundId }: { id: string; roundId: string }) {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<RoundLoad | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/${id}/rounds/${roundId}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to load round");
      return;
    }
    setError(null);
    setData(await res.json());
  }, [id, roundId]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-green-700">Loading…</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href={`/events/${id}`} className="text-sm text-green-700">
          ← Event
        </Link>
        {error && (
          <div className="mt-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {!error && (
          <div className="mt-3 text-sm text-gray-500">Loading round…</div>
        )}
      </div>
    );
  }

  const { round, holes, players, scores, teams, team_scores } = data;
  const isScramble = round.round_format === "scramble";

  const front = holes.filter((h) => h.hole_number <= 9);
  const back = holes.filter((h) => h.hole_number >= 10);

  const playerScoreMap = new Map<string, number>(); // `${playerId}:${hole}` -> strokes
  for (const s of scores) {
    playerScoreMap.set(`${s.player_id}:${s.hole_number}`, s.strokes);
  }
  const teamScoreMap = new Map<string, number>(); // `${teamId}:${hole}` -> strokes
  for (const s of team_scores) {
    teamScoreMap.set(`${s.team_id}:${s.hole_number}`, s.strokes);
  }

  const totalPar = holes.reduce((sum, h) => sum + h.par, 0);
  const frontPar = front.reduce((sum, h) => sum + h.par, 0);
  const backPar = back.reduce((sum, h) => sum + h.par, 0);

  function totalsFor(getStrokes: (h: number) => number | null): {
    out: number;
    in: number;
    total: number;
    through: number;
  } {
    let out = 0;
    let inSum = 0;
    let through = 0;
    for (const h of holes) {
      const s = getStrokes(h.hole_number);
      if (s != null) {
        through += 1;
        if (h.hole_number <= 9) out += s;
        else inSum += s;
      }
    }
    return { out, in: inSum, total: out + inSum, through };
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 pb-12">
      <div className="flex items-center justify-between">
        <Link
          href={`/events/${id}`}
          className="text-sm text-green-700 font-medium"
        >
          ← Event
        </Link>
        <Link
          href={`/events/${id}/score/${roundId}`}
          className="text-sm text-green-700 font-medium"
        >
          Score this round →
        </Link>
      </div>

      <h1 className="mt-2 text-xl font-bold text-green-800">
        Round {round.round_number} scorecard
      </h1>
      <div className="text-xs text-gray-500">
        {round.played_at} · {round.round_format} · {round.hole_count} holes ·
        Par {totalPar}
      </div>

      <div className="mt-4 -mx-4 px-4 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr className="bg-gray-50">
              <th className="sticky left-0 z-10 bg-gray-50 px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 border-b border-gray-200">
                {isScramble ? "Team" : "Player"}
              </th>
              {front.map((h) => (
                <th
                  key={`fh-${h.hole_number}`}
                  className="px-2 py-1.5 text-center text-[11px] font-semibold text-gray-600 border-b border-gray-200 min-w-[2rem]"
                >
                  {h.hole_number}
                </th>
              ))}
              {front.length > 0 && (
                <th className="px-2 py-1.5 text-center text-[11px] font-bold text-gray-700 bg-gray-100 border-b border-gray-200">
                  Out
                </th>
              )}
              {back.map((h) => (
                <th
                  key={`bh-${h.hole_number}`}
                  className="px-2 py-1.5 text-center text-[11px] font-semibold text-gray-600 border-b border-gray-200 min-w-[2rem]"
                >
                  {h.hole_number}
                </th>
              ))}
              {back.length > 0 && (
                <th className="px-2 py-1.5 text-center text-[11px] font-bold text-gray-700 bg-gray-100 border-b border-gray-200">
                  In
                </th>
              )}
              <th className="px-2 py-1.5 text-center text-[11px] font-bold text-gray-700 bg-gray-200 border-b border-gray-200">
                Tot
              </th>
              <th className="px-2 py-1.5 text-center text-[11px] font-bold text-gray-700 bg-gray-200 border-b border-gray-200">
                v Par
              </th>
            </tr>
            <tr className="bg-green-50 text-green-900">
              <td className="sticky left-0 z-10 bg-green-50 px-2 py-1.5 text-left text-[11px] font-semibold border-b border-green-200">
                Par
              </td>
              {front.map((h) => (
                <td
                  key={`fp-${h.hole_number}`}
                  className="px-2 py-1.5 text-center text-[11px] font-semibold border-b border-green-200"
                >
                  {h.par}
                </td>
              ))}
              {front.length > 0 && (
                <td className="px-2 py-1.5 text-center text-[11px] font-bold border-b border-green-200 bg-green-100">
                  {frontPar}
                </td>
              )}
              {back.map((h) => (
                <td
                  key={`bp-${h.hole_number}`}
                  className="px-2 py-1.5 text-center text-[11px] font-semibold border-b border-green-200"
                >
                  {h.par}
                </td>
              ))}
              {back.length > 0 && (
                <td className="px-2 py-1.5 text-center text-[11px] font-bold border-b border-green-200 bg-green-100">
                  {backPar}
                </td>
              )}
              <td className="px-2 py-1.5 text-center text-[11px] font-bold border-b border-green-200 bg-green-100">
                {totalPar}
              </td>
              <td className="px-2 py-1.5 text-center text-[11px] font-bold border-b border-green-200 bg-green-100">
                —
              </td>
            </tr>
          </thead>
          <tbody>
            {isScramble
              ? teams.map((tm) => {
                  const get = (h: number) =>
                    teamScoreMap.get(`${tm.id}:${h}`) ?? null;
                  const tot = totalsFor(get);
                  const vsPar = tot.total - parThru(holes, get);
                  return (
                    <tr key={tm.id} className="bg-white">
                      <td className="sticky left-0 z-10 bg-white px-2 py-1.5 text-left border-b border-gray-100">
                        <div className="font-semibold text-gray-900 text-xs">
                          {tm.name}
                        </div>
                        <div className="text-[10px] text-gray-500 truncate max-w-[10rem]">
                          {tm.members.map((m) => m.display_name).join(", ")}
                        </div>
                      </td>
                      {front.map((h) => {
                        const s = get(h.hole_number);
                        return (
                          <td
                            key={`fs-${tm.id}-${h.hole_number}`}
                            className={`px-2 py-1.5 text-center text-xs border-b border-gray-100 ${cellTone(s, h.par)}`}
                          >
                            {s ?? "·"}
                          </td>
                        );
                      })}
                      {front.length > 0 && (
                        <td className="px-2 py-1.5 text-center text-xs font-bold text-gray-800 bg-gray-50 border-b border-gray-100">
                          {tot.out || "—"}
                        </td>
                      )}
                      {back.map((h) => {
                        const s = get(h.hole_number);
                        return (
                          <td
                            key={`bs-${tm.id}-${h.hole_number}`}
                            className={`px-2 py-1.5 text-center text-xs border-b border-gray-100 ${cellTone(s, h.par)}`}
                          >
                            {s ?? "·"}
                          </td>
                        );
                      })}
                      {back.length > 0 && (
                        <td className="px-2 py-1.5 text-center text-xs font-bold text-gray-800 bg-gray-50 border-b border-gray-100">
                          {tot.in || "—"}
                        </td>
                      )}
                      <td className="px-2 py-1.5 text-center text-xs font-bold text-gray-900 bg-gray-100 border-b border-gray-100">
                        {tot.total || "—"}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-center text-xs font-bold bg-gray-100 border-b border-gray-100 ${
                          tot.through === 0
                            ? "text-gray-400"
                            : vsPar < 0
                              ? "text-green-700"
                              : vsPar > 0
                                ? "text-red-600"
                                : "text-gray-700"
                        }`}
                      >
                        {tot.through === 0 ? "—" : vsParLabel(vsPar)}
                      </td>
                    </tr>
                  );
                })
              : players.map((p) => {
                  const get = (h: number) =>
                    playerScoreMap.get(`${p.user_id}:${h}`) ?? null;
                  const tot = totalsFor(get);
                  const vsPar = tot.total - parThru(holes, get);
                  return (
                    <tr key={p.user_id} className="bg-white">
                      <td className="sticky left-0 z-10 bg-white px-2 py-1.5 text-left border-b border-gray-100">
                        <div className="font-semibold text-gray-900 text-xs truncate max-w-[8rem]">
                          {p.display_name}
                        </div>
                      </td>
                      {front.map((h) => {
                        const s = get(h.hole_number);
                        return (
                          <td
                            key={`fs-${p.user_id}-${h.hole_number}`}
                            className={`px-2 py-1.5 text-center text-xs border-b border-gray-100 ${cellTone(s, h.par)}`}
                          >
                            {s ?? "·"}
                          </td>
                        );
                      })}
                      {front.length > 0 && (
                        <td className="px-2 py-1.5 text-center text-xs font-bold text-gray-800 bg-gray-50 border-b border-gray-100">
                          {tot.out || "—"}
                        </td>
                      )}
                      {back.map((h) => {
                        const s = get(h.hole_number);
                        return (
                          <td
                            key={`bs-${p.user_id}-${h.hole_number}`}
                            className={`px-2 py-1.5 text-center text-xs border-b border-gray-100 ${cellTone(s, h.par)}`}
                          >
                            {s ?? "·"}
                          </td>
                        );
                      })}
                      {back.length > 0 && (
                        <td className="px-2 py-1.5 text-center text-xs font-bold text-gray-800 bg-gray-50 border-b border-gray-100">
                          {tot.in || "—"}
                        </td>
                      )}
                      <td className="px-2 py-1.5 text-center text-xs font-bold text-gray-900 bg-gray-100 border-b border-gray-100">
                        {tot.total || "—"}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-center text-xs font-bold bg-gray-100 border-b border-gray-100 ${
                          tot.through === 0
                            ? "text-gray-400"
                            : vsPar < 0
                              ? "text-green-700"
                              : vsPar > 0
                                ? "text-red-600"
                                : "text-gray-700"
                        }`}
                      >
                        {tot.through === 0 ? "—" : vsParLabel(vsPar)}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-gray-600">
        <Legend tone="bg-yellow-100 text-yellow-800" label="Eagle+" />
        <Legend tone="bg-red-100 text-red-700" label="Birdie" />
        <Legend tone="bg-green-50 text-green-800" label="Par" />
        <Legend tone="bg-blue-50 text-blue-700" label="Bogey" />
        <Legend tone="bg-blue-100 text-blue-900" label="Double" />
        <Legend tone="bg-gray-200 text-gray-800" label="3+" />
      </div>
    </div>
  );
}

function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${tone}`}>
      <span>{label}</span>
    </span>
  );
}

function vsParLabel(n: number): string {
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : String(n);
}

function parThru(
  holes: HolePar[],
  get: (h: number) => number | null,
): number {
  let p = 0;
  for (const h of holes) {
    if (get(h.hole_number) != null) p += h.par;
  }
  return p;
}
