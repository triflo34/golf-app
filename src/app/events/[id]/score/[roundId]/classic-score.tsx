"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { fetchOrQueue } from "@/lib/offline-queue";
import type { ScoreEditEntry } from "@/app/api/events/[id]/rounds/[roundId]/edits/route";

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
  updated_by: string | null;
  updated_by_name: string | null;
  updated_at: string;
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
  updated_by: string | null;
  updated_by_name: string | null;
  updated_at: string;
};

type RoundLoad = {
  round: RoundInfo;
  holes: HolePar[];
  players: PlayerInfo[];
  scores: ScoreInfo[];
  teams: TeamInfo[];
  team_scores: TeamScoreInfo[];
  viewer_id: string;
  viewer_is_organizer: boolean;
  event_status: string | null;
  poker_enabled: boolean;
};

function classify(strokes: number, par: number): { label: string; tone: string } {
  const d = strokes - par;
  if (d <= -2) return { label: "Eagle+", tone: "bg-yellow-100 text-yellow-800" };
  if (d === -1) return { label: "Birdie", tone: "bg-red-100 text-red-700" };
  if (d === 0) return { label: "Par", tone: "bg-green-100 text-green-700" };
  if (d === 1) return { label: "Bogey", tone: "bg-blue-50 text-blue-700" };
  if (d === 2) return { label: "Double", tone: "bg-blue-100 text-blue-800" };
  return { label: `+${d}`, tone: "bg-gray-100 text-gray-700" };
}

function vsParLabel(n: number): string {
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : String(n);
}

type LeaderRow = {
  key: string;
  name: string;
  subtitle: string | null;
  strokes: number;
  through: number;
  vsPar: number;
  rank: number;
  is_leader: boolean;
};

export function ClassicEventScore({ id, roundId }: { id: string; roundId: string }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<RoundLoad | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [hole, setHole] = useState(1);
  const [edits, setEdits] = useState<ScoreEditEntry[] | null>(null);
  const [showEdits, setShowEdits] = useState(false);

  // Optimistic overlays: { "key": strokes | null } where null means "cleared".
  // `key` is `${playerId}:${hole}` for individual or `team:${teamId}:${hole}` for scramble.
  const [pendingScores, setPendingScores] = useState<Map<string, number | null>>(
    new Map(),
  );

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/${id}/rounds/${roundId}`, { cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to load round");
      return;
    }
    setError(null);
    const next = (await res.json()) as RoundLoad;
    setData(next);
    // Only drop pending entries the server has caught up on. A pending value
    // that still differs from the server is in-flight or queued — keep it so
    // the user's tap doesn't flicker back to the stale server value.
    setPendingScores((prev) => {
      if (prev.size === 0) return prev;
      const serverScore = new Map<string, number>();
      for (const s of next.scores) {
        serverScore.set(`${s.player_id}:${s.hole_number}`, s.strokes);
      }
      const serverTeamScore = new Map<string, number>();
      for (const s of next.team_scores) {
        serverTeamScore.set(`team:${s.team_id}:${s.hole_number}`, s.strokes);
      }
      const out = new Map(prev);
      for (const [k, v] of prev) {
        const server = k.startsWith("team:") ? serverTeamScore.get(k) : serverScore.get(k);
        if (v === null) {
          if (server === undefined) out.delete(k); // cleared and confirmed
        } else if (server === v) {
          out.delete(k); // server caught up
        }
      }
      return out;
    });
  }, [id, roundId]);

  const loadEdits = useCallback(async () => {
    const res = await fetch(`/api/events/${id}/rounds/${roundId}/edits`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const body = await res.json();
    setEdits(body.edits ?? []);
  }, [id, roundId]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  useEffect(() => {
    if (user && showEdits) loadEdits();
  }, [user, showEdits, loadEdits]);

  // Background refresh so peer edits show up. Pauses when the tab is hidden.
  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    function start() {
      stop();
      timer = setInterval(load, 30_000);
    }
    function stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        load();
        start();
      } else {
        stop();
      }
    }
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user, load]);

  const isScramble = data?.round.round_format === "scramble";

  // Resume on the lowest hole that's not fully scored.
  useEffect(() => {
    if (!data) return;
    const { holes } = data;
    if (holes.length === 0) return;
    const unitCount = isScramble ? data.teams.length : data.players.length;
    if (unitCount === 0) return;
    for (const h of holes) {
      const filledForHole = isScramble
        ? data.team_scores.filter((s) => s.hole_number === h.hole_number).length
        : data.scores.filter((s) => s.hole_number === h.hole_number).length;
      if (filledForHole < unitCount) {
        setHole(h.hole_number);
        return;
      }
    }
    setHole(holes[holes.length - 1].hole_number);
    // run only on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data === null]);

  // Plain strokes maps, overlayed with optimistic pending values.
  const playerStrokes = useMemo(() => {
    const m = new Map<string, number>(); // key = `${playerId}:${hole}` → strokes
    if (!data) return m;
    for (const s of data.scores) {
      m.set(`${s.player_id}:${s.hole_number}`, s.strokes);
    }
    for (const [k, v] of pendingScores) {
      if (k.startsWith("team:")) continue;
      if (v === null) m.delete(k);
      else m.set(k, v);
    }
    return m;
  }, [data, pendingScores]);

  const teamStrokes = useMemo(() => {
    const m = new Map<string, number>(); // key = `${teamId}:${hole}` → strokes
    if (!data) return m;
    for (const s of data.team_scores) {
      m.set(`${s.team_id}:${s.hole_number}`, s.strokes);
    }
    for (const [k, v] of pendingScores) {
      if (!k.startsWith("team:")) continue;
      const parts = k.split(":");
      const teamId = parts[1];
      const hn = parts[2];
      const mapKey = `${teamId}:${hn}`;
      if (v === null) m.delete(mapKey);
      else m.set(mapKey, v);
    }
    return m;
  }, [data, pendingScores]);

  // Last-edit metadata (server-only — we don't track this for pending overlays).
  const scoreMeta = useMemo(() => {
    const m = new Map<string, ScoreInfo>();
    if (!data) return m;
    for (const s of data.scores) m.set(`${s.player_id}:${s.hole_number}`, s);
    return m;
  }, [data]);

  // Live leaderboard, recomputed in lockstep with optimistic edits.
  const leaderboard: LeaderRow[] = useMemo(() => {
    if (!data) return [];
    const parByHole = new Map(data.holes.map((h) => [h.hole_number, h.par]));
    type Agg = { through: number; strokes: number; vsPar: number };
    if (isScramble) {
      const rows = data.teams.map((tm) => {
        let a: Agg = { through: 0, strokes: 0, vsPar: 0 };
        for (const h of data.holes) {
          const s = teamStrokes.get(`${tm.id}:${h.hole_number}`);
          if (s != null) {
            a = {
              through: a.through + 1,
              strokes: a.strokes + s,
              vsPar: a.vsPar + s - (parByHole.get(h.hole_number) ?? 4),
            };
          }
        }
        const sub = tm.members.map((m) => m.display_name).join(", ") || null;
        return { key: `team:${tm.id}`, name: tm.name, subtitle: sub, ...a };
      });
      return rankRows(rows);
    }
    const rows = data.players.map((p) => {
      let a: Agg = { through: 0, strokes: 0, vsPar: 0 };
      for (const h of data.holes) {
        const s = playerStrokes.get(`${p.user_id}:${h.hole_number}`);
        if (s != null) {
          a = {
            through: a.through + 1,
            strokes: a.strokes + s,
            vsPar: a.vsPar + s - (parByHole.get(h.hole_number) ?? 4),
          };
        }
      }
      return { key: p.user_id, name: p.display_name, subtitle: null, ...a };
    });
    return rankRows(rows);
  }, [data, playerStrokes, teamStrokes, isScramble]);

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-green-700 text-lg">Loading...</div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href={`/events/${id}`} className="text-sm text-green-700">
          ← Event
        </Link>
        <div className="mt-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-green-700 text-lg">Loading round…</div>
      </div>
    );
  }

  const { round, holes, players, teams } = data;
  // Organizers can edit every row; everyone else only their own (or a scramble
  // team they belong to). Enforced server-side too — this just hides controls.
  const canEditAll = data.viewer_is_organizer;
  const myId = user.id;
  const currentHole = holes.find((h) => h.hole_number === hole);
  const currentPar = currentHole?.par ?? 4;
  const currentYardage = currentHole?.yardage ?? null;
  const currentHandicap = currentHole?.handicap_index ?? null;

  function setStrokes(playerId: string, strokes: number | null) {
    const key = `${playerId}:${hole}`;
    const prev = pendingScores.get(key);
    const hadPrev = pendingScores.has(key);
    setPendingScores((m) => {
      const next = new Map(m);
      next.set(key, strokes);
      return next;
    });
    setError(null);
    fetchOrQueue(`/api/events/${id}/rounds/${roundId}/holes`, {
      method: "POST",
      body: { player_id: playerId, hole_number: hole, strokes },
      label: `hole ${hole} for ${playerId.slice(0, 8)}`,
    })
      .then(async (res) => {
        if (res === null) return; // queued offline
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "Save failed");
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Save failed");
        setPendingScores((m) => {
          const next = new Map(m);
          if (hadPrev) next.set(key, prev as number | null);
          else next.delete(key);
          return next;
        });
      });
  }

  function setTeamStrokes(teamId: number, strokes: number | null) {
    const key = `team:${teamId}:${hole}`;
    const prev = pendingScores.get(key);
    const hadPrev = pendingScores.has(key);
    setPendingScores((m) => {
      const next = new Map(m);
      next.set(key, strokes);
      return next;
    });
    setError(null);
    fetchOrQueue(`/api/events/${id}/rounds/${roundId}/team-holes`, {
      method: "POST",
      body: { team_id: teamId, hole_number: hole, strokes },
      label: `hole ${hole} for team ${teamId}`,
    })
      .then(async (res) => {
        if (res === null) return; // queued offline
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "Save failed");
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Save failed");
        setPendingScores((m) => {
          const next = new Map(m);
          if (hadPrev) next.set(key, prev as number | null);
          else next.delete(key);
          return next;
        });
      });
  }

  const minHole = holes[0]?.hole_number ?? 1;
  const maxHole = holes[holes.length - 1]?.hole_number ?? 18;
  const unitCount = isScramble ? teams.length : players.length;
  const totalCells = holes.length * unitCount;
  const filledCells = isScramble
    ? teamStrokes.size
    : playerStrokes.size;
  const roundComplete = totalCells > 0 && filledCells >= totalCells;
  const eventCompleted =
    data.event_status === "completed" || data.event_status === "archived";

  async function finishEvent() {
    setFinishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to finish event");
      router.push(
        data!.poker_enabled
          ? `/events/${id}/poker?round=${roundId}`
          : `/events/${id}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to finish event");
      setFinishing(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-lg mx-auto px-4 py-4 pb-[60vh]">
        <div className="flex items-center justify-between gap-2">
          <Link href={`/events/${id}`} className="text-sm text-green-700 font-medium">
            ← Event
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href={`/events/${id}/poker?round=${roundId}`}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-green-700 hover:border-green-400"
            >
              ♠ Poker
            </Link>
            <Link
              href={`/events/${id}/scorecard/${roundId}`}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-green-700 hover:border-green-400"
            >
              Scorecard
            </Link>
            <div className="text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
              <span className="text-red-600">LIVE</span>
              <span className="text-gray-400">
                · R{round.round_number} · {round.round_format} · {round.hole_count}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 bg-white rounded-xl shadow-sm border border-gray-200 p-3">
          <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
            {isScramble ? "Team Leaderboard" : "Leaderboard"}
          </div>
          {leaderboard.length === 0 ? (
            <div className="mt-2 text-xs text-gray-500">
              {isScramble
                ? "No scramble teams yet. Organizer needs to create teams before scoring."
                : "No players yet."}
            </div>
          ) : (
            <div className="mt-2 space-y-1">
              {leaderboard.map((row) => {
                const tied =
                  leaderboard.findIndex(
                    (r) => r.rank === row.rank && r.key !== row.key,
                  ) !== -1;
                const vsParTone =
                  row.through === 0
                    ? "text-gray-500"
                    : row.vsPar > 0
                      ? "text-red-600"
                      : row.vsPar < 0
                        ? "text-green-700"
                        : "text-gray-500";
                return (
                  <div
                    key={row.key}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={
                          row.is_leader
                            ? "inline-flex items-center justify-center w-7 h-7 rounded-full bg-yellow-400 text-yellow-900 text-xs font-bold"
                            : "inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-600 text-xs font-bold"
                        }
                      >
                        {tied ? `T${row.rank}` : row.rank}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {row.is_leader && (
                            <span className="text-yellow-500">👑 </span>
                          )}
                          {row.name}
                        </div>
                        {row.subtitle && (
                          <div className="text-[10px] text-gray-500 truncate">
                            {row.subtitle}
                          </div>
                        )}
                        <div className="text-[11px] text-gray-500">
                          {row.through === 0
                            ? "—"
                            : `${row.strokes} · thru ${row.through}`}
                        </div>
                      </div>
                    </div>
                    <div className={`text-lg font-bold ${vsParTone}`}>
                      {row.through === 0 ? "—" : vsParLabel(row.vsPar)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Round complete → finalize the event and head to poker judging. */}
        {roundComplete && (
          <div className="mt-3 rounded-xl border border-green-300 bg-green-50 p-3">
            <div className="text-sm font-semibold text-green-800">✓ Round complete</div>
            <p className="mt-0.5 text-xs text-green-700">
              All {totalCells} scores are in.
              {eventCompleted ? " This event is finalized." : ""}
            </p>
            {canEditAll && !eventCompleted ? (
              <button
                type="button"
                onClick={finishEvent}
                disabled={finishing}
                className="mt-2 w-full rounded-md bg-green-700 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {finishing
                  ? "Finishing…"
                  : data.poker_enabled
                    ? "Finish event & review poker →"
                    : "Finish event →"}
              </button>
            ) : data.poker_enabled ? (
              <Link
                href={`/events/${id}/poker?round=${roundId}`}
                className="mt-2 block w-full rounded-md border border-green-600 py-2 text-center text-sm font-semibold text-green-700 hover:bg-green-100"
              >
                Review poker hands →
              </Link>
            ) : (
              <Link
                href={`/events/${id}`}
                className="mt-2 block w-full rounded-md border border-gray-300 py-2 text-center text-sm font-medium text-gray-700 hover:border-green-400"
              >
                Back to event →
              </Link>
            )}
            {canEditAll && !eventCompleted && (
              <p className="mt-1.5 text-center text-[10px] text-gray-500">
                Finishing locks scoring and computes final payouts.
              </p>
            )}
          </div>
        )}

        <div className="mt-3 -mx-4 overflow-x-auto">
          <div className="flex px-4 gap-1 min-w-max">
            {holes.map((h) => {
              const filled = isScramble
                ? teams.filter((tm) => teamStrokes.has(`${tm.id}:${h.hole_number}`)).length
                : players.filter((p) => playerStrokes.has(`${p.user_id}:${h.hole_number}`)).length;
              const complete = unitCount > 0 && filled === unitCount;
              const isCurrent = h.hole_number === hole;
              return (
                <button
                  key={h.hole_number}
                  type="button"
                  onClick={() => setHole(h.hole_number)}
                  className={
                    isCurrent
                      ? "min-w-[2rem] h-8 text-xs font-bold rounded border border-green-700 bg-green-700 text-white"
                      : complete
                        ? "min-w-[2rem] h-8 text-xs font-medium rounded border border-green-300 bg-green-50 text-green-800"
                        : "min-w-[2rem] h-8 text-xs font-medium rounded border border-gray-200 text-gray-600 bg-white"
                  }
                >
                  {h.hole_number}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-3 rounded-md border border-gray-200 bg-white">
          <button
            type="button"
            onClick={() => setShowEdits((v) => !v)}
            className="w-full px-3 py-2 flex items-center justify-between text-xs font-semibold text-gray-700"
            aria-expanded={showEdits}
          >
            <span>Recent edits</span>
            <span
              className={`transition-transform text-gray-400 ${
                showEdits ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            >
              ▾
            </span>
          </button>
          {showEdits && (
            <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-700 max-h-48 overflow-y-auto">
              {edits === null ? (
                <div className="text-gray-400">Loading…</div>
              ) : edits.length === 0 ? (
                <div className="text-gray-400">No edits yet.</div>
              ) : (
                <ul className="space-y-1">
                  {edits.map((e) => (
                    <li key={e.id} className="leading-snug">
                      <span className="text-gray-500">
                        {formatRelative(e.edited_at)} ·
                      </span>{" "}
                      <span className="font-medium text-gray-900">
                        {e.edited_by_name}
                      </span>{" "}
                      {e.subject_name && e.subject_name !== e.edited_by_name && (
                        <>
                          set{" "}
                          <span className="font-medium text-gray-900">
                            {e.subject_name}
                          </span>
                          &apos;s
                        </>
                      )}
                      {(!e.subject_name ||
                        e.subject_name === e.edited_by_name) && <>set</>}{" "}
                      hole {e.hole_number}{" "}
                      {e.new_strokes == null ? (
                        <>
                          to{" "}
                          <span className="text-red-700 font-semibold">
                            cleared
                          </span>
                        </>
                      ) : e.old_strokes == null ? (
                        <>
                          to{" "}
                          <span className="text-green-700 font-semibold">
                            {e.new_strokes}
                          </span>
                        </>
                      ) : (
                        <>
                          from{" "}
                          <span className="text-gray-500">{e.old_strokes}</span>{" "}
                          →{" "}
                          <span className="text-green-700 font-semibold">
                            {e.new_strokes}
                          </span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <p className="mt-3 text-[11px] text-gray-400">
          {isScramble ? "Team scores. " : ""}
          {canEditAll
            ? "As organizer you can edit every score. Edits are logged."
            : isScramble
              ? "You can score your own team. Only the organizer can edit other teams. Edits are logged."
              : "You can score your own row. Only the organizer can edit others. Edits are logged."}
        </p>
      </div>

      <div className="safe-area-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50">
          <button
            type="button"
            onClick={() => setHole((h) => Math.max(minHole, h - 1))}
            disabled={hole <= minHole}
            className="w-11 h-11 rounded-md border border-gray-300 bg-white text-gray-800 text-lg leading-none disabled:opacity-30"
          >
            ←
          </button>
          <div className="flex-1 text-center text-sm font-bold text-green-800">
            Hole {hole} · Par {currentPar}
            <div className="text-[10px] text-gray-500">
              {currentYardage != null && <>{currentYardage} yds</>}
              {currentYardage != null && currentHandicap != null && <> · </>}
              {currentHandicap != null && <>HCP {currentHandicap}</>}
              {(currentYardage != null || currentHandicap != null) && <> · </>}
              {filledCells}/{totalCells} entered
            </div>
          </div>
          <button
            type="button"
            onClick={() => setHole((h) => Math.min(maxHole, h + 1))}
            disabled={hole >= maxHole}
            className="w-11 h-11 rounded-md border border-gray-300 bg-white text-gray-800 text-lg leading-none disabled:opacity-30"
          >
            →
          </button>
        </div>

        <div className="max-h-[40vh] overflow-y-auto px-3 py-2 space-y-2 max-w-lg mx-auto">
          {isScramble && teams.length === 0 && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              No scramble teams yet. Organizer needs to create teams from the
              Manage page before scramble scoring can begin.
            </div>
          )}

          {isScramble
            ? teams.map((tm) => {
                const score = teamStrokes.get(`${tm.id}:${hole}`) ?? null;
                const cls = score != null ? classify(score, currentPar) : null;
                const editable = canEditAll || tm.members.some((m) => m.user_id === myId);
                return (
                  <div
                    key={tm.id}
                    className={`rounded-xl border border-gray-200 px-3 py-3 ${editable ? "bg-white" : "bg-gray-50"}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {tm.name}
                        </div>
                        <div className="text-[10px] text-gray-500 truncate">
                          {tm.members.map((m) => m.display_name).join(", ")}
                        </div>
                        {cls && (
                          <span
                            className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded ${cls.tone}`}
                          >
                            {cls.label}
                          </span>
                        )}
                      </div>
                      {editable ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setTeamStrokes(tm.id, currentPar)}
                            className={
                              score === currentPar
                                ? "h-11 px-3 rounded-md border border-green-600 bg-green-600 text-xs font-semibold text-white"
                                : "h-11 px-3 rounded-md border border-green-300 bg-green-50 text-xs font-semibold text-green-800"
                            }
                          >
                            Par
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setTeamStrokes(
                                tm.id,
                                Math.max(1, (score ?? currentPar) - 1),
                              )
                            }
                            className="w-11 h-11 rounded-md border border-gray-300 bg-white text-2xl leading-none text-gray-800"
                          >
                            −
                          </button>
                          <div className="w-14 text-center">
                            <div className="text-3xl font-bold text-gray-900 leading-none">
                              {score ?? "–"}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setTeamStrokes(tm.id, (score ?? currentPar) + 1)
                            }
                            className="w-11 h-11 rounded-md border border-gray-300 bg-white text-2xl leading-none text-gray-800"
                          >
                            +
                          </button>
                          {score != null && (
                            <button
                              type="button"
                              onClick={() => setTeamStrokes(tm.id, null)}
                              className="ml-1 text-xs text-gray-400 hover:text-red-600"
                              title="Clear"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 pr-1">
                          <span className="text-3xl font-bold text-gray-900 leading-none">
                            {score ?? "–"}
                          </span>
                          <span className="text-gray-400" title="Read only" aria-label="Read only">
                            🔒
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            : players.map((p) => {
                const score = playerStrokes.get(`${p.user_id}:${hole}`) ?? null;
                const cls = score != null ? classify(score, currentPar) : null;
                const meta = scoreMeta.get(`${p.user_id}:${hole}`);
                const editable = canEditAll || p.user_id === myId;
                return (
                  <div
                    key={p.user_id}
                    className={`rounded-xl border border-gray-200 px-3 py-3 ${editable ? "bg-white" : "bg-gray-50"}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {p.display_name}
                        </div>
                        {cls && (
                          <span
                            className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded ${cls.tone}`}
                          >
                            {cls.label}
                          </span>
                        )}
                        {meta?.updated_by_name &&
                          meta.updated_by !== p.user_id && (
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              last edit by {meta.updated_by_name}
                            </div>
                          )}
                      </div>
                      {editable ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setStrokes(p.user_id, currentPar)}
                            className={
                              score === currentPar
                                ? "h-11 px-3 rounded-md border border-green-600 bg-green-600 text-xs font-semibold text-white"
                                : "h-11 px-3 rounded-md border border-green-300 bg-green-50 text-xs font-semibold text-green-800"
                            }
                          >
                            Par
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setStrokes(
                                p.user_id,
                                Math.max(1, (score ?? currentPar) - 1),
                              )
                            }
                            className="w-11 h-11 rounded-md border border-gray-300 bg-white text-2xl leading-none text-gray-800"
                          >
                            −
                          </button>
                          <div className="w-14 text-center">
                            <div className="text-3xl font-bold text-gray-900 leading-none">
                              {score ?? "–"}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setStrokes(p.user_id, (score ?? currentPar) + 1)
                            }
                            className="w-11 h-11 rounded-md border border-gray-300 bg-white text-2xl leading-none text-gray-800"
                          >
                            +
                          </button>
                          {score != null && (
                            <button
                              type="button"
                              onClick={() => setStrokes(p.user_id, null)}
                              className="ml-1 text-xs text-gray-400 hover:text-red-600"
                              title="Clear"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 pr-1">
                          <span className="text-3xl font-bold text-gray-900 leading-none">
                            {score ?? "–"}
                          </span>
                          <span className="text-gray-400" title="Read only" aria-label="Read only">
                            🔒
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
        </div>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function rankRows<T extends { key: string; through: number; vsPar: number; strokes: number }>(
  rows: T[],
): (T & { rank: number; is_leader: boolean })[] {
  const sorted = rows.slice().sort((a, b) => {
    if (a.through === 0 && b.through > 0) return 1;
    if (b.through === 0 && a.through > 0) return -1;
    if (a.vsPar !== b.vsPar) return a.vsPar - b.vsPar;
    if (a.strokes !== b.strokes) return a.strokes - b.strokes;
    return a.key.localeCompare(b.key);
  });
  const out: (T & { rank: number; is_leader: boolean })[] = [];
  let lastVs: number | null = null;
  let lastBucket: number | null = null;
  let rank = 0;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const bucket = r.through === 0 ? 0 : 1;
    const tied = lastVs !== null && r.vsPar === lastVs && bucket === lastBucket;
    if (!tied) rank = i + 1;
    lastVs = r.vsPar;
    lastBucket = bucket;
    out.push({ ...r, rank, is_leader: rank === 1 && r.through > 0 });
  }
  return out;
}
