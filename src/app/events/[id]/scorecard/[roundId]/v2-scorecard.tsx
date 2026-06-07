"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { stablefordPoints } from "@/lib/stableford";

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
  stableford_enabled?: boolean;
};

function cellTone(strokes: number | null, par: number): string {
  if (strokes == null) return "text-[var(--v2-text-faint)]";
  const d = strokes - par;
  if (d <= -2) return "bg-[var(--v2-gold)]/25 text-[var(--v2-gold-bright)] font-bold";
  if (d === -1) return "bg-red-500/25 text-red-300 font-bold";
  if (d === 0) return "bg-[var(--v2-sage)]/18 text-[var(--v2-score-soft)]";
  if (d === 1) return "bg-blue-500/20 text-blue-300";
  if (d === 2) return "bg-blue-700/40 text-blue-200 font-semibold";
  return "bg-white/10 text-[var(--v2-text-dim)] font-semibold";
}

function vsParTone(vsPar: number, through: number): string {
  if (through === 0) return "text-[var(--v2-text-faint)]";
  if (vsPar < 0) return "text-[var(--v2-sage)]";
  if (vsPar > 0) return "text-red-300";
  return "text-[var(--v2-text-dim)]";
}

const serif = { fontFamily: "var(--font-fraunces), Georgia, serif" };

export function V2EventScorecard({ id, roundId }: { id: string; roundId: string }) {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<RoundLoad | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/${id}/rounds/${roundId}`, { cache: "no-store" });
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
      <div className="v2-bg flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-[var(--v2-gold)]">Loading…</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="v2-bg min-h-screen px-4 py-6 text-[var(--v2-text)]">
        <Link href={`/events/${id}`} className="text-sm text-[var(--v2-gold)]">
          ← Event
        </Link>
        {error ? (
          <div className="mt-3 rounded-lg border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        ) : (
          <div className="mt-3 text-sm text-[var(--v2-text-dim)]">Loading round…</div>
        )}
      </div>
    );
  }

  const { round, holes, players, scores, teams, team_scores } = data;
  const isScramble = round.round_format === "scramble";
  // Stableford is individual-only, so the points column shows on individual rounds.
  const showPoints = Boolean(data.stableford_enabled) && !isScramble;

  const front = holes.filter((h) => h.hole_number <= 9);
  const back = holes.filter((h) => h.hole_number >= 10);

  const playerScoreMap = new Map<string, number>();
  for (const s of scores) {
    playerScoreMap.set(`${s.player_id}:${s.hole_number}`, s.strokes);
  }
  const teamScoreMap = new Map<string, number>();
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

  const headCell =
    "px-2 py-1.5 text-center text-[11px] font-semibold text-[var(--v2-text-dim)] border-b border-[var(--v2-border)]";
  const sumHead =
    "px-2 py-1.5 text-center text-[11px] font-bold text-[var(--v2-text)] bg-[var(--v2-surface-2)] border-b border-[var(--v2-border)]";
  const totHead =
    "px-2 py-1.5 text-center text-[11px] font-bold text-[var(--v2-gold)] bg-[var(--v2-surface-2)] border-b border-[var(--v2-border)]";
  const sumCell =
    "px-2 py-1.5 text-center text-xs font-bold text-[var(--v2-text)] bg-[var(--v2-surface)] border-b border-[var(--v2-border)]";

  return (
    <div className="v2-bg min-h-screen text-[var(--v2-text)]">
      <div className="mx-auto max-w-3xl px-4 py-4 pb-24">
        <div className="flex items-center justify-between">
          <Link href={`/events/${id}`} className="text-sm font-medium text-[var(--v2-gold)]">
            ← Event
          </Link>
          <Link
            href={`/events/${id}/score/${roundId}`}
            className="text-sm font-medium text-[var(--v2-gold)]"
          >
            Score this round →
          </Link>
        </div>

        <h1 className="mt-2 text-[20px] font-medium text-[var(--v2-gold)]" style={serif}>
          Round {round.round_number} scorecard
        </h1>
        <div className="text-xs text-[var(--v2-text-dim)]">
          {round.played_at} · {round.round_format} · {round.hole_count} holes · Par {totalPar}
        </div>

        <div className="-mx-4 mt-4 overflow-x-auto px-4">
          <table className="min-w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-[var(--v2-border)] bg-[var(--v2-bg-0)] px-2 py-1.5 text-left text-[11px] font-semibold text-[var(--v2-text-dim)]">
                  {isScramble ? "Team" : "Player"}
                </th>
                {front.map((h) => (
                  <th key={`fh-${h.hole_number}`} className={`${headCell} min-w-[2rem]`}>
                    {h.hole_number}
                  </th>
                ))}
                {front.length > 0 && <th className={sumHead}>Out</th>}
                {back.map((h) => (
                  <th key={`bh-${h.hole_number}`} className={`${headCell} min-w-[2rem]`}>
                    {h.hole_number}
                  </th>
                ))}
                {back.length > 0 && <th className={sumHead}>In</th>}
                <th className={totHead}>Tot</th>
                <th className={totHead}>v Par</th>
                {showPoints && <th className={totHead}>Pts</th>}
              </tr>
              <tr>
                <td className="sticky left-0 z-10 border-b border-[var(--v2-border)] bg-[var(--v2-bg-0)] px-2 py-1.5 text-left text-[11px] font-semibold text-[var(--v2-gold)]">
                  Par
                </td>
                {front.map((h) => (
                  <td
                    key={`fp-${h.hole_number}`}
                    className="border-b border-[var(--v2-border)] bg-[var(--v2-gold)]/8 px-2 py-1.5 text-center text-[11px] font-semibold text-[var(--v2-gold)]"
                  >
                    {h.par}
                  </td>
                ))}
                {front.length > 0 && (
                  <td className="border-b border-[var(--v2-border)] bg-[var(--v2-gold)]/12 px-2 py-1.5 text-center text-[11px] font-bold text-[var(--v2-gold)]">
                    {frontPar}
                  </td>
                )}
                {back.map((h) => (
                  <td
                    key={`bp-${h.hole_number}`}
                    className="border-b border-[var(--v2-border)] bg-[var(--v2-gold)]/8 px-2 py-1.5 text-center text-[11px] font-semibold text-[var(--v2-gold)]"
                  >
                    {h.par}
                  </td>
                ))}
                {back.length > 0 && (
                  <td className="border-b border-[var(--v2-border)] bg-[var(--v2-gold)]/12 px-2 py-1.5 text-center text-[11px] font-bold text-[var(--v2-gold)]">
                    {backPar}
                  </td>
                )}
                <td className="border-b border-[var(--v2-border)] bg-[var(--v2-gold)]/12 px-2 py-1.5 text-center text-[11px] font-bold text-[var(--v2-gold)]">
                  {totalPar}
                </td>
                <td className="border-b border-[var(--v2-border)] bg-[var(--v2-gold)]/12 px-2 py-1.5 text-center text-[11px] font-bold text-[var(--v2-gold)]">
                  —
                </td>
                {showPoints && (
                  <td className="border-b border-[var(--v2-border)] bg-[var(--v2-gold)]/12 px-2 py-1.5 text-center text-[11px] font-bold text-[var(--v2-gold)]">
                    —
                  </td>
                )}
              </tr>
            </thead>
            <tbody>
              {(isScramble ? teams : players).map((unit) => {
                const isTeam = "members" in unit;
                const key = isTeam ? `${(unit as TeamInfo).id}` : (unit as PlayerInfo).user_id;
                const get = (h: number) =>
                  (isTeam
                    ? teamScoreMap.get(`${(unit as TeamInfo).id}:${h}`)
                    : playerScoreMap.get(`${(unit as PlayerInfo).user_id}:${h}`)) ?? null;
                const tot = totalsFor(get);
                const vsPar = tot.total - parThru(holes, get);
                return (
                  <tr key={key}>
                    <td className="sticky left-0 z-10 border-b border-[var(--v2-border)] bg-[var(--v2-bg-0)] px-2 py-1.5 text-left">
                      {isTeam ? (
                        <>
                          <div className="text-xs font-semibold text-[var(--v2-text)]">
                            {(unit as TeamInfo).name}
                          </div>
                          <div className="max-w-[10rem] truncate text-[10px] text-[var(--v2-text-dim)]">
                            {(unit as TeamInfo).members.map((m) => m.display_name).join(", ")}
                          </div>
                        </>
                      ) : (
                        <div className="max-w-[8rem] truncate text-xs font-semibold text-[var(--v2-text)]">
                          {(unit as PlayerInfo).display_name}
                        </div>
                      )}
                    </td>
                    {front.map((h) => {
                      const s = get(h.hole_number);
                      return (
                        <td
                          key={`fs-${key}-${h.hole_number}`}
                          className={`border-b border-[var(--v2-border)] px-2 py-1.5 text-center text-xs ${cellTone(s, h.par)}`}
                        >
                          {s ?? "·"}
                        </td>
                      );
                    })}
                    {front.length > 0 && <td className={sumCell}>{tot.out || "—"}</td>}
                    {back.map((h) => {
                      const s = get(h.hole_number);
                      return (
                        <td
                          key={`bs-${key}-${h.hole_number}`}
                          className={`border-b border-[var(--v2-border)] px-2 py-1.5 text-center text-xs ${cellTone(s, h.par)}`}
                        >
                          {s ?? "·"}
                        </td>
                      );
                    })}
                    {back.length > 0 && <td className={sumCell}>{tot.in || "—"}</td>}
                    <td className="border-b border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-2 py-1.5 text-center text-xs font-bold text-[var(--v2-text)]">
                      {tot.total || "—"}
                    </td>
                    <td
                      className={`border-b border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-2 py-1.5 text-center text-xs font-bold ${vsParTone(vsPar, tot.through)}`}
                    >
                      {tot.through === 0 ? "—" : vsParLabel(vsPar)}
                    </td>
                    {showPoints && (
                      <td className="border-b border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-2 py-1.5 text-center text-xs font-bold text-[var(--v2-gold)]">
                        {tot.through === 0
                          ? "—"
                          : holes.reduce((sum, h) => {
                              const s = get(h.hole_number);
                              return s == null ? sum : sum + stablefordPoints(s, h.par);
                            }, 0)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
          <Legend tone="bg-[var(--v2-gold)]/25 text-[var(--v2-gold-bright)]" label="Eagle+" />
          <Legend tone="bg-red-500/25 text-red-300" label="Birdie" />
          <Legend tone="bg-[var(--v2-sage)]/18 text-[var(--v2-score-soft)]" label="Par" />
          <Legend tone="bg-blue-500/20 text-blue-300" label="Bogey" />
          <Legend tone="bg-blue-700/40 text-blue-200" label="Double" />
          <Legend tone="bg-white/10 text-[var(--v2-text-dim)]" label="3+" />
        </div>
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

function parThru(holes: HolePar[], get: (h: number) => number | null): number {
  let p = 0;
  for (const h of holes) {
    if (get(h.hole_number) != null) p += h.par;
  }
  return p;
}
