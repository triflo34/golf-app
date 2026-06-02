"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { fetchOrQueue } from "@/lib/offline-queue";
import { V2LivePill } from "@/components/v2/live-pill";
import { V2Avatar, toneForName } from "@/components/v2/avatar";
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
};

/** Score-type label + tinted chip (traditional golf coloring, matching the
 *  Live Round dock + scorecard). */
function scoreType(strokes: number, par: number): { label: string; chip: string } {
  const d = strokes - par;
  if (d <= -2) return { label: "Eagle+", chip: "bg-[var(--v2-gold)]/25 text-[var(--v2-gold-bright)]" };
  if (d === -1) return { label: "Birdie", chip: "bg-red-500/25 text-red-300" };
  if (d === 0) return { label: "Par", chip: "bg-[var(--v2-sage)]/20 text-[var(--v2-score-soft)]" };
  if (d === 1) return { label: "Bogey", chip: "bg-blue-500/20 text-blue-300" };
  if (d === 2) return { label: "Double", chip: "bg-blue-700/40 text-blue-200" };
  return { label: `+${d}`, chip: "bg-white/5 text-[var(--v2-text-dim)]" };
}

function vsParLabel(n: number): string {
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : String(n);
}

function vsParTone(vsPar: number, through: number): string {
  if (through === 0) return "text-[var(--v2-text-dim)]";
  if (vsPar < 0) return "text-[var(--v2-sage)]";
  if (vsPar > 0) return "text-red-300";
  return "text-[var(--v2-text-dim)]";
}

const serif = { fontFamily: "var(--font-fraunces), Georgia, serif" };

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

export function V2EventScore({ id, roundId }: { id: string; roundId: string }) {
  const { user, loading: authLoading } = useAuth();

  const [data, setData] = useState<RoundLoad | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hole, setHole] = useState(1);
  const [edits, setEdits] = useState<ScoreEditEntry[] | null>(null);
  const [showEdits, setShowEdits] = useState(false);

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
          if (server === undefined) out.delete(k);
        } else if (server === v) {
          out.delete(k);
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

  const playerStrokes = useMemo(() => {
    const m = new Map<string, number>();
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
    const m = new Map<string, number>();
    if (!data) return m;
    for (const s of data.team_scores) {
      m.set(`${s.team_id}:${s.hole_number}`, s.strokes);
    }
    for (const [k, v] of pendingScores) {
      if (!k.startsWith("team:")) continue;
      const parts = k.split(":");
      const mapKey = `${parts[1]}:${parts[2]}`;
      if (v === null) m.delete(mapKey);
      else m.set(mapKey, v);
    }
    return m;
  }, [data, pendingScores]);

  const scoreMeta = useMemo(() => {
    const m = new Map<string, ScoreInfo>();
    if (!data) return m;
    for (const s of data.scores) m.set(`${s.player_id}:${s.hole_number}`, s);
    return m;
  }, [data]);

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
      <div className="v2-bg flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-[var(--v2-gold)]">Loading…</div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="v2-bg min-h-screen px-4 py-6 text-[var(--v2-text)]">
        <Link href={`/events/${id}`} className="text-sm text-[var(--v2-gold)]">
          ← Event
        </Link>
        <div className="mt-3 rounded-lg border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="v2-bg flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-[var(--v2-gold)]">Loading round…</div>
      </div>
    );
  }

  const { round, holes, players, teams } = data;
  const currentHole = holes.find((h) => h.hole_number === hole);
  const currentPar = currentHole?.par ?? 4;
  const currentYardage = currentHole?.yardage ?? null;
  const currentHandicap = currentHole?.handicap_index ?? null;

  function setStrokes(playerId: string, strokes: number | null) {
    const key = `${playerId}:${hole}`;
    const prev = pendingScores.get(key);
    const hadPrev = pendingScores.has(key);
    setPendingScores((m) => new Map(m).set(key, strokes));
    setError(null);
    fetchOrQueue(`/api/events/${id}/rounds/${roundId}/holes`, {
      method: "POST",
      body: { player_id: playerId, hole_number: hole, strokes },
      label: `hole ${hole} for ${playerId.slice(0, 8)}`,
    })
      .then(async (res) => {
        if (res === null) return;
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
    setPendingScores((m) => new Map(m).set(key, strokes));
    setError(null);
    fetchOrQueue(`/api/events/${id}/rounds/${roundId}/team-holes`, {
      method: "POST",
      body: { team_id: teamId, hole_number: hole, strokes },
      label: `hole ${hole} for team ${teamId}`,
    })
      .then(async (res) => {
        if (res === null) return;
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
  const filledCells = isScramble ? teamStrokes.size : playerStrokes.size;

  return (
    <div className="v2-bg min-h-screen text-[var(--v2-text)]">
      <div className="mx-auto max-w-lg px-4 py-4 pb-[66vh]">
        <div className="flex items-center justify-between gap-2">
          <Link href={`/events/${id}`} className="text-sm font-medium text-[var(--v2-gold)]">
            ← Event
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href={`/events/${id}/scorecard/${roundId}`}
              className="inline-flex items-center rounded-md border border-[var(--v2-border)] bg-[var(--v2-surface)] px-2.5 py-1 text-xs font-medium text-[var(--v2-gold)]"
            >
              Scorecard
            </Link>
            <div className="flex items-center gap-1.5">
              <V2LivePill />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--v2-text-dim)]">
                R{round.round_number} · {round.round_format} · {round.hole_count}
              </span>
            </div>
          </div>
        </div>

        {/* Leaderboard */}
        <section className="v2-card mt-3 !p-0">
          <div
            className="px-3.5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-gold)]"
            style={{ ...serif, letterSpacing: "0.06em" }}
          >
            {isScramble ? "Team Leaderboard" : "Leaderboard"}
          </div>
          {leaderboard.length === 0 ? (
            <div className="px-3.5 pb-3 text-xs text-[var(--v2-text-dim)]">
              {isScramble
                ? "No scramble teams yet. The organizer needs to create teams before scoring."
                : "No players yet."}
            </div>
          ) : (
            <div className="space-y-1 px-2 pb-2">
              {leaderboard.map((row) => {
                const tied =
                  leaderboard.findIndex((r) => r.rank === row.rank && r.key !== row.key) !== -1;
                return (
                  <div key={row.key} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5">
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                        row.is_leader
                          ? "bg-[var(--v2-gold)] text-[var(--v2-green-deep)]"
                          : "bg-[var(--v2-surface-2)] text-[var(--v2-text-dim)]"
                      }`}
                    >
                      {tied ? `T${row.rank}` : row.rank}
                    </span>
                    <V2Avatar
                      initial={(row.name.charAt(0) || "?").toUpperCase()}
                      tone={toneForName(row.name)}
                      leader={row.is_leader}
                      size={28}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[var(--v2-text)]">
                        {row.name}
                      </div>
                      {row.subtitle && (
                        <div className="truncate text-[10px] text-[var(--v2-text-dim)]">
                          {row.subtitle}
                        </div>
                      )}
                      <div className="text-[11px] text-[var(--v2-text-faint)]">
                        {row.through === 0 ? "—" : `${row.strokes} · thru ${row.through}`}
                      </div>
                    </div>
                    <div className={`text-lg font-bold ${vsParTone(row.vsPar, row.through)}`} style={serif}>
                      {row.through === 0 ? "—" : vsParLabel(row.vsPar)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Hole strip */}
        <div className="-mx-4 mt-3 overflow-x-auto px-4 no-scrollbar">
          <div className="flex min-w-max gap-1.5">
            {holes.map((h) => {
              const filled = isScramble
                ? teams.filter((tm) => teamStrokes.has(`${tm.id}:${h.hole_number}`)).length
                : players.filter((p) => playerStrokes.has(`${p.user_id}:${h.hole_number}`)).length;
              const complete = unitCount > 0 && filled === unitCount;
              const isCurrent = h.hole_number === hole;
              const tone = isCurrent
                ? "bg-[var(--v2-gold)] text-[var(--v2-green-deep)]"
                : complete
                  ? "border border-[var(--v2-gold)]/40 bg-[var(--v2-gold)]/10 text-[var(--v2-gold)]"
                  : "border border-[var(--v2-border)] bg-[var(--v2-surface)] text-[var(--v2-text-dim)]";
              return (
                <button
                  key={h.hole_number}
                  type="button"
                  onClick={() => setHole(h.hole_number)}
                  className={`h-9 min-w-[2.1rem] rounded-lg text-xs font-semibold transition-colors ${tone}`}
                >
                  {h.hole_number}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Recent edits */}
        <div className="v2-card mt-3 !p-0">
          <button
            type="button"
            onClick={() => setShowEdits((v) => !v)}
            className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-[var(--v2-text)]"
            aria-expanded={showEdits}
          >
            <span>Recent edits</span>
            <span className={`text-[var(--v2-text-dim)] transition-transform ${showEdits ? "rotate-180" : ""}`} aria-hidden="true">
              ▾
            </span>
          </button>
          {showEdits && (
            <div className="max-h-48 overflow-y-auto border-t border-[var(--v2-border)] px-3.5 py-2 text-xs text-[var(--v2-text)]">
              {edits === null ? (
                <div className="text-[var(--v2-text-faint)]">Loading…</div>
              ) : edits.length === 0 ? (
                <div className="text-[var(--v2-text-faint)]">No edits yet.</div>
              ) : (
                <ul className="space-y-1">
                  {edits.map((e) => (
                    <li key={e.id} className="leading-snug">
                      <span className="text-[var(--v2-text-dim)]">{formatRelative(e.edited_at)} ·</span>{" "}
                      <span className="font-medium text-[var(--v2-text)]">{e.edited_by_name}</span>{" "}
                      {e.subject_name && e.subject_name !== e.edited_by_name && (
                        <>
                          set <span className="font-medium text-[var(--v2-text)]">{e.subject_name}</span>&apos;s
                        </>
                      )}
                      {(!e.subject_name || e.subject_name === e.edited_by_name) && <>set</>} hole {e.hole_number}{" "}
                      {e.new_strokes == null ? (
                        <>to <span className="font-semibold text-red-300">cleared</span></>
                      ) : e.old_strokes == null ? (
                        <>to <span className="font-semibold text-[var(--v2-sage)]">{e.new_strokes}</span></>
                      ) : (
                        <>
                          from <span className="text-[var(--v2-text-dim)]">{e.old_strokes}</span> →{" "}
                          <span className="font-semibold text-[var(--v2-sage)]">{e.new_strokes}</span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <p className="mt-3 text-[11px] text-[var(--v2-text-faint)]">
          {isScramble ? "Team scores. " : ""}
          Anyone in the event can edit any score. Edits are logged.
        </p>
      </div>

      {/* Sticky scoring dock */}
      <div className="safe-area-bottom fixed inset-x-0 bottom-0 z-40 border-t border-[var(--v2-border)] bg-[var(--v2-bg-0)] shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center gap-2 border-b border-[var(--v2-border)] px-4 py-2">
            <button
              type="button"
              onClick={() => setHole((h) => Math.max(minHole, h - 1))}
              disabled={hole <= minHole}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--v2-border)] bg-[var(--v2-surface)] text-lg text-[var(--v2-text)] disabled:opacity-30"
            >
              ←
            </button>
            <div className="flex-1 text-center">
              <div className="text-[13px] font-bold text-[var(--v2-gold)]" style={serif}>
                Hole {hole} · Par {currentPar}
              </div>
              <div className="text-[10px] text-[var(--v2-text-dim)]">
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
              className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--v2-border)] bg-[var(--v2-surface)] text-lg text-[var(--v2-text)] disabled:opacity-30"
            >
              →
            </button>
          </div>

          <div className="max-h-[56vh] space-y-1.5 overflow-y-auto px-3 py-2.5">
            {isScramble && teams.length === 0 && (
              <div className="rounded-lg border border-[var(--v2-amber-warn)]/40 bg-[var(--v2-amber-warn)]/10 px-3 py-2 text-sm text-[var(--v2-amber-warn)]">
                No scramble teams yet. The organizer needs to create teams from the Manage page
                before scramble scoring can begin.
              </div>
            )}

            {isScramble
              ? teams.map((tm) => {
                  const score = teamStrokes.get(`${tm.id}:${hole}`) ?? null;
                  const type = score != null ? scoreType(score, currentPar) : null;
                  return (
                    <ScoreRow
                      key={tm.id}
                      title={tm.name}
                      subtitle={tm.members.map((m) => m.display_name).join(", ")}
                      avatarTone={toneForName(tm.name)}
                      score={score}
                      type={type}
                      onPar={() => setTeamStrokes(tm.id, currentPar)}
                      onMinus={() => setTeamStrokes(tm.id, Math.max(1, (score ?? currentPar) - 1))}
                      onPlus={() => setTeamStrokes(tm.id, (score ?? currentPar) + 1)}
                      onClear={() => setTeamStrokes(tm.id, null)}
                      isPar={score === currentPar}
                    />
                  );
                })
              : players.map((p) => {
                  const score = playerStrokes.get(`${p.user_id}:${hole}`) ?? null;
                  const type = score != null ? scoreType(score, currentPar) : null;
                  const meta = scoreMeta.get(`${p.user_id}:${hole}`);
                  const editedBy =
                    meta?.updated_by_name && meta.updated_by !== p.user_id
                      ? `last edit by ${meta.updated_by_name}`
                      : null;
                  return (
                    <ScoreRow
                      key={p.user_id}
                      title={p.display_name}
                      subtitle={editedBy}
                      avatarTone={toneForName(p.display_name)}
                      score={score}
                      type={type}
                      onPar={() => setStrokes(p.user_id, currentPar)}
                      onMinus={() => setStrokes(p.user_id, Math.max(1, (score ?? currentPar) - 1))}
                      onPlus={() => setStrokes(p.user_id, (score ?? currentPar) + 1)}
                      onClear={() => setStrokes(p.user_id, null)}
                      isPar={score === currentPar}
                    />
                  );
                })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreRow({
  title,
  subtitle,
  avatarTone,
  score,
  type,
  isPar,
  onPar,
  onMinus,
  onPlus,
  onClear,
}: {
  title: string;
  subtitle: string | null;
  avatarTone: ReturnType<typeof toneForName>;
  score: number | null;
  type: { label: string; chip: string } | null;
  isPar: boolean;
  onPar: () => void;
  onMinus: () => void;
  onPlus: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface)] px-2.5 py-1.5">
      <V2Avatar initial={(title.charAt(0) || "?").toUpperCase()} tone={avatarTone} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-[var(--v2-text)]">{title}</span>
          {type && (
            <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${type.chip}`}>
              {type.label}
            </span>
          )}
        </div>
        {subtitle && <div className="truncate text-[10px] text-[var(--v2-text-dim)]">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onPar}
          className={`h-9 rounded-md px-2 text-[11px] font-semibold ${
            isPar
              ? "bg-[var(--v2-gold)] text-[var(--v2-green-deep)]"
              : "border border-[var(--v2-gold)]/35 bg-[var(--v2-gold)]/10 text-[var(--v2-gold)]"
          }`}
        >
          Par
        </button>
        <button
          type="button"
          onClick={onMinus}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--v2-border)] bg-[var(--v2-bg-0)] text-xl leading-none text-[var(--v2-text)]"
        >
          −
        </button>
        <div className="w-7 text-center text-xl font-bold leading-none text-[var(--v2-text)]" style={serif}>
          {score ?? "–"}
        </div>
        <button
          type="button"
          onClick={onPlus}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--v2-border)] bg-[var(--v2-bg-0)] text-xl leading-none text-[var(--v2-text)]"
        >
          +
        </button>
        {score != null && (
          <button
            type="button"
            onClick={onClear}
            className="ml-0.5 text-xs text-[var(--v2-text-faint)] hover:text-[var(--v2-red)]"
            title="Clear"
          >
            ×
          </button>
        )}
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
