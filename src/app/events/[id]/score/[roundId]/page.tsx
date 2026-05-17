"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
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

type HolePar = { hole_number: number; par: number };

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

function classify(strokes: number, par: number): { label: string; tone: string } {
  const d = strokes - par;
  if (d <= -2) return { label: "Eagle+", tone: "bg-yellow-100 text-yellow-800" };
  if (d === -1) return { label: "Birdie", tone: "bg-red-100 text-red-700" };
  if (d === 0) return { label: "Par", tone: "bg-green-100 text-green-700" };
  if (d === 1) return { label: "Bogey", tone: "bg-blue-50 text-blue-700" };
  if (d === 2) return { label: "Double", tone: "bg-blue-100 text-blue-800" };
  return { label: `+${d}`, tone: "bg-gray-100 text-gray-700" };
}

export default function ScorePage({
  params,
}: {
  params: Promise<{ id: string; roundId: string }>;
}) {
  const { id, roundId } = use(params);
  const { user, loading: authLoading } = useAuth();

  const [data, setData] = useState<RoundLoad | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hole, setHole] = useState(1);
  const [saving, setSaving] = useState<string | null>(null);

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
    setData(await res.json());
    // Fresh server data is authoritative — drop any pending overlays.
    setPendingScores(new Map());
  }, [id, roundId]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

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

  const scoreMap = useMemo(() => {
    const m = new Map<string, ScoreInfo>();
    if (!data) return m;
    for (const s of data.scores) {
      m.set(`${s.player_id}:${s.hole_number}`, s);
    }
    // Overlay pending optimistic updates.
    for (const [key, strokes] of pendingScores) {
      if (key.startsWith("team:")) continue;
      if (strokes === null) {
        m.delete(key);
      } else {
        const [playerId, holeStr] = key.split(":");
        const hn = Number(holeStr);
        m.set(key, {
          id: -1,
          player_id: playerId,
          hole_number: hn,
          strokes,
          updated_by: user?.id ?? null,
          updated_by_name: user?.display_name ?? null,
          updated_at: new Date().toISOString(),
        });
      }
    }
    return m;
  }, [data, pendingScores, user]);

  const teamScoreMap = useMemo(() => {
    const m = new Map<string, TeamScoreInfo>();
    if (!data) return m;
    for (const s of data.team_scores) {
      m.set(`${s.team_id}:${s.hole_number}`, s);
    }
    for (const [key, strokes] of pendingScores) {
      if (!key.startsWith("team:")) continue;
      // key shape: team:<teamId>:<hole>
      const parts = key.split(":");
      const teamId = Number(parts[1]);
      const hn = Number(parts[2]);
      const mapKey = `${teamId}:${hn}`;
      if (strokes === null) {
        m.delete(mapKey);
      } else {
        m.set(mapKey, {
          id: -1,
          team_id: teamId,
          hole_number: hn,
          strokes,
          updated_by: user?.id ?? null,
          updated_by_name: user?.display_name ?? null,
          updated_at: new Date().toISOString(),
        });
      }
    }
    return m;
  }, [data, pendingScores, user]);

  const totals = useMemo(() => {
    const t = new Map<string, { strokes: number; through: number; vsPar: number }>();
    if (!data) return t;
    const parByHole = new Map(data.holes.map((h) => [h.hole_number, h.par]));
    if (isScramble) {
      for (const tm of data.teams) {
        let strokes = 0;
        let through = 0;
        let vsPar = 0;
        for (const h of data.holes) {
          const s = teamScoreMap.get(`${tm.id}:${h.hole_number}`);
          if (s) {
            strokes += s.strokes;
            through += 1;
            vsPar += s.strokes - (parByHole.get(h.hole_number) ?? 4);
          }
        }
        t.set(`team:${tm.id}`, { strokes, through, vsPar });
      }
    } else {
      for (const p of data.players) {
        let strokes = 0;
        let through = 0;
        let vsPar = 0;
        for (const h of data.holes) {
          const s = scoreMap.get(`${p.user_id}:${h.hole_number}`);
          if (s) {
            strokes += s.strokes;
            through += 1;
            vsPar += s.strokes - (parByHole.get(h.hole_number) ?? 4);
          }
        }
        t.set(p.user_id, { strokes, through, vsPar });
      }
    }
    return t;
  }, [data, scoreMap, teamScoreMap, isScramble]);

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-green-700 text-lg">Loading...</div>
      </div>
    );
  }
  if (error) {
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
  const currentPar = holes.find((h) => h.hole_number === hole)?.par ?? 4;

  function setStrokes(playerId: string, strokes: number | null) {
    const key = `${playerId}:${hole}`;
    // Snapshot previous pending value so we can revert on failure.
    const prev = pendingScores.get(key);
    const hadPrev = pendingScores.has(key);
    // Optimistic: update UI immediately.
    setPendingScores((m) => {
      const next = new Map(m);
      next.set(key, strokes);
      return next;
    });
    setSaving(key);
    setError(null);
    // Fire-and-forget; don't refetch on success — the optimistic value already matches.
    fetch(`/api/events/${id}/rounds/${roundId}/holes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_id: playerId,
        hole_number: hole,
        strokes,
      }),
    })
      .then(async (res) => {
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
      })
      .finally(() => {
        setSaving((curr) => (curr === key ? null : curr));
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
    setSaving(key);
    setError(null);
    fetch(`/api/events/${id}/rounds/${roundId}/team-holes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team_id: teamId,
        hole_number: hole,
        strokes,
      }),
    })
      .then(async (res) => {
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
      })
      .finally(() => {
        setSaving((curr) => (curr === key ? null : curr));
      });
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-4 pb-24">
      <div className="flex items-center justify-between">
        <Link href={`/events/${id}`} className="text-sm text-green-700">
          ← Event
        </Link>
        <div className="text-xs text-gray-500">
          R{round.round_number} · {round.round_format} · {round.hole_count} holes
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setHole((h) => Math.max(1, h - 1))}
          disabled={hole === 1}
          className="px-3 py-1.5 rounded border border-gray-300 text-sm disabled:opacity-30"
        >
          ←
        </button>
        <div className="text-center">
          <div className="text-sm text-gray-500">Hole</div>
          <div className="text-3xl font-bold text-green-800 leading-none">{hole}</div>
          <div className="text-xs text-gray-500">Par {currentPar}</div>
        </div>
        <button
          type="button"
          onClick={() => setHole((h) => Math.min(round.hole_count, h + 1))}
          disabled={hole === round.hole_count}
          className="px-3 py-1.5 rounded border border-gray-300 text-sm disabled:opacity-30"
        >
          →
        </button>
      </div>

      <div className="mt-3 -mx-4 overflow-x-auto">
        <div className="flex px-4 gap-1 min-w-max">
          {holes.map((h) => {
            const units = isScramble ? teams.length : players.length;
            const filled = isScramble
              ? teams.filter((tm) => teamScoreMap.has(`${tm.id}:${h.hole_number}`)).length
              : players.filter((p) => scoreMap.has(`${p.user_id}:${h.hole_number}`)).length;
            const complete = units > 0 && filled === units;
            const isCurrent = h.hole_number === hole;
            return (
              <button
                key={h.hole_number}
                type="button"
                onClick={() => setHole(h.hole_number)}
                className={`min-w-[2rem] h-8 text-xs font-medium rounded border ${
                  isCurrent
                    ? "border-green-700 bg-green-700 text-white"
                    : complete
                      ? "border-green-300 bg-green-50 text-green-800"
                      : "border-gray-200 text-gray-600"
                }`}
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

      {isScramble && teams.length === 0 && (
        <div className="mt-4 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          No scramble teams yet. Organizer needs to create teams from the Manage
          page before scramble scoring can begin.
        </div>
      )}

      {isScramble ? (
        <ul className="mt-4 divide-y divide-gray-100 border border-gray-200 rounded-md bg-white">
          {teams.map((tm) => {
            const score = teamScoreMap.get(`${tm.id}:${hole}`);
            const tot = totals.get(`team:${tm.id}`);
            const cls = score ? classify(score.strokes, currentPar) : null;
            const key = `team:${tm.id}:${hole}`;
            const isSaving = saving === key;
            return (
              <li key={tm.id} className="px-3 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {tm.name}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {tm.members.map((m) => m.display_name).join(", ")}
                  </div>
                  <div className="text-xs text-gray-500">
                    {tot && tot.through > 0
                      ? `${tot.strokes} thru ${tot.through} · ${tot.vsPar > 0 ? `+${tot.vsPar}` : tot.vsPar} v par`
                      : "—"}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTeamStrokes(tm.id, Math.max(1, (score?.strokes ?? currentPar) - 1))}
                    /* optimistic: no disable */
                    className="w-9 h-9 rounded-md border border-gray-300 text-lg leading-none"
                  >
                    −
                  </button>
                  <div className="w-12 text-center">
                    <div className="text-2xl font-semibold text-gray-900 leading-none">
                      {score?.strokes ?? "–"}
                    </div>
                    {cls && (
                      <span className={`mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded ${cls.tone}`}>
                        {cls.label}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setTeamStrokes(tm.id, (score?.strokes ?? currentPar) + 1)}
                    /* optimistic: no disable */
                    className="w-9 h-9 rounded-md border border-gray-300 text-lg leading-none"
                  >
                    +
                  </button>
                  {score && (
                    <button
                      type="button"
                      onClick={() => setTeamStrokes(tm.id, null)}
                      /* optimistic: no disable */
                      className="ml-1 text-xs text-gray-400 hover:text-red-600"
                      title="Clear"
                    >
                      ×
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
      <ul className="mt-4 divide-y divide-gray-100 border border-gray-200 rounded-md bg-white">
        {players.map((p) => {
          const score = scoreMap.get(`${p.user_id}:${hole}`);
          const tot = totals.get(p.user_id);
          const cls = score ? classify(score.strokes, currentPar) : null;
          const key = `${p.user_id}:${hole}`;
          const isSaving = saving === key;
          return (
            <li key={p.user_id} className="px-3 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {p.display_name}
                </div>
                <div className="text-xs text-gray-500">
                  {tot && tot.through > 0
                    ? `${tot.strokes} thru ${tot.through} · ${tot.vsPar > 0 ? `+${tot.vsPar}` : tot.vsPar} v par`
                    : "—"}
                </div>
                {score?.updated_by_name && score.updated_by !== p.user_id && (
                  <div className="text-[10px] text-gray-400">
                    last edit by {score.updated_by_name}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setStrokes(p.user_id, Math.max(1, (score?.strokes ?? currentPar) - 1))}
                  /* optimistic: no disable */
                  className="w-9 h-9 rounded-md border border-gray-300 text-lg leading-none"
                >
                  −
                </button>
                <div className="w-12 text-center">
                  <div className="text-2xl font-semibold text-gray-900 leading-none">
                    {score?.strokes ?? "–"}
                  </div>
                  {cls && (
                    <span className={`mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded ${cls.tone}`}>
                      {cls.label}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setStrokes(p.user_id, (score?.strokes ?? currentPar) + 1)}
                  /* optimistic: no disable */
                  className="w-9 h-9 rounded-md border border-gray-300 text-lg leading-none"
                >
                  +
                </button>
                {score && (
                  <button
                    type="button"
                    onClick={() => setStrokes(p.user_id, null)}
                    /* optimistic: no disable */
                    className="ml-1 text-xs text-gray-400 hover:text-red-600"
                    title="Clear"
                  >
                    ×
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      )}

      <p className="mt-3 text-[11px] text-gray-400">
        {isScramble ? "Team scores. " : ""}
        Anyone in the event can edit any score. Edits are logged.
      </p>
    </div>
  );
}
