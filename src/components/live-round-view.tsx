"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { fetchOrQueue } from "@/lib/offline-queue";
import type { LiveLeaderRow, LiveRoundLoad } from "@/app/api/rounds/live/[id]/route";

type Variant = "classic" | "v2";

type Props = {
  roundId: number;
  variant?: Variant;
};

type PendingMap = Map<string, number | null>; // key = `${playerKey}:${hole}`

function classify(strokes: number, par: number, v2: boolean): { label: string; tone: string } {
  const d = strokes - par;
  if (v2) {
    if (d <= -2) return { label: "Eagle+", tone: "bg-yellow-500/25 text-yellow-300" };
    if (d === -1) return { label: "Birdie", tone: "bg-red-500/25 text-red-300" };
    if (d === 0) return { label: "Par", tone: "bg-[var(--v2-score)]/25 text-[var(--v2-score-soft)]" };
    if (d === 1) return { label: "Bogey", tone: "bg-blue-500/25 text-blue-300" };
    if (d === 2) return { label: "Double", tone: "bg-blue-700/40 text-blue-200" };
    return { label: `+${d}`, tone: "bg-[var(--v2-surface-2)] text-[var(--v2-muted)]" };
  }
  if (d <= -2) return { label: "Eagle+", tone: "bg-yellow-100 text-yellow-800" };
  if (d === -1) return { label: "Birdie", tone: "bg-red-100 text-red-700" };
  if (d === 0) return { label: "Par", tone: "bg-green-100 text-green-700" };
  if (d === 1) return { label: "Bogey", tone: "bg-blue-50 text-blue-700" };
  if (d === 2) return { label: "Double", tone: "bg-blue-100 text-blue-800" };
  return { label: `+${d}`, tone: "bg-gray-100 text-gray-700" };
}

function styles(variant: Variant) {
  const v2 = variant === "v2";
  return {
    page: v2
      ? "min-h-screen bg-[var(--v2-bg)] text-white"
      : "min-h-screen bg-gray-50 text-gray-900",
    // Big bottom padding leaves room for the sticky entry dock.
    container: "max-w-lg mx-auto px-4 py-4 pb-[60vh]",
    backLink: v2
      ? "text-sm text-[var(--v2-accent)] font-medium"
      : "text-sm text-green-700 font-medium",
    card: v2
      ? "rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-3"
      : "bg-white rounded-xl shadow-sm border border-gray-200 p-3",
    sectionHeader: v2
      ? "text-xs uppercase tracking-wide text-[var(--v2-muted)] font-semibold"
      : "text-xs uppercase tracking-wide text-gray-500 font-semibold",
    leaderRow: v2
      ? "flex items-center justify-between rounded-lg px-3 py-2"
      : "flex items-center justify-between rounded-lg px-3 py-2",
    leaderName: v2 ? "text-sm font-semibold text-white" : "text-sm font-semibold text-gray-900",
    leaderMeta: v2 ? "text-[11px] text-[var(--v2-muted)]" : "text-[11px] text-gray-500",
    holeStripWrap: "mt-3 -mx-4 overflow-x-auto",
    holeBtnIdle: v2
      ? "min-w-[2rem] h-8 text-xs font-medium rounded border border-[var(--v2-border)] bg-[var(--v2-surface)] text-[var(--v2-muted)]"
      : "min-w-[2rem] h-8 text-xs font-medium rounded border border-gray-200 text-gray-600 bg-white",
    holeBtnFilled: v2
      ? "min-w-[2rem] h-8 text-xs font-medium rounded border border-[var(--v2-accent)]/50 bg-[var(--v2-accent)]/10 text-[var(--v2-accent)]"
      : "min-w-[2rem] h-8 text-xs font-medium rounded border border-green-300 bg-green-50 text-green-800",
    holeBtnActive: v2
      ? "min-w-[2rem] h-8 text-xs font-bold rounded border-2 border-[var(--v2-accent)] bg-[var(--v2-accent)] text-black"
      : "min-w-[2rem] h-8 text-xs font-bold rounded border border-green-700 bg-green-700 text-white",
    bigBtn: v2
      ? "w-11 h-11 rounded-md border border-[var(--v2-border)] bg-[var(--v2-surface-2)] text-2xl leading-none text-white"
      : "w-11 h-11 rounded-md border border-gray-300 bg-white text-2xl leading-none text-gray-800",
    parBtnIdle: v2
      ? "h-11 px-3 rounded-md border border-[var(--v2-accent)]/40 bg-[var(--v2-accent)]/10 text-xs font-semibold text-[var(--v2-accent)]"
      : "h-11 px-3 rounded-md border border-green-300 bg-green-50 text-xs font-semibold text-green-800",
    parBtnActive: v2
      ? "h-11 px-3 rounded-md border border-[var(--v2-accent)] bg-[var(--v2-accent)] text-xs font-semibold text-black"
      : "h-11 px-3 rounded-md border border-green-600 bg-green-600 text-xs font-semibold text-white",
    scoreBox: v2 ? "w-14 text-center" : "w-14 text-center",
    scoreVal: v2 ? "text-3xl font-bold text-white leading-none" : "text-3xl font-bold text-gray-900 leading-none",
    clearBtn: v2 ? "text-xs text-[var(--v2-muted)] hover:text-red-400" : "text-xs text-gray-400 hover:text-red-600",
    playerRowWrap: v2
      ? "rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3"
      : "rounded-xl border border-gray-200 bg-white px-3 py-3",
    playerName: v2 ? "text-sm font-semibold text-white" : "text-sm font-semibold text-gray-900",
    playerSub: v2 ? "text-xs text-[var(--v2-muted)]" : "text-xs text-gray-500",
    dock: v2
      ? "safe-area-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--v2-border)] bg-[var(--v2-surface)]/95 backdrop-blur shadow-[0_-8px_24px_rgba(0,0,0,0.4)]"
      : "safe-area-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur shadow-[0_-8px_24px_rgba(0,0,0,0.08)]",
    dockNavRow: v2
      ? "flex items-center gap-2 px-4 py-2 border-b border-[var(--v2-border)] bg-[var(--v2-surface-2)]/60"
      : "flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50",
    dockHoleBadge: v2
      ? "flex-1 text-center text-sm font-bold text-[var(--v2-accent)]"
      : "flex-1 text-center text-sm font-bold text-green-800",
    dockHoleSub: v2 ? "text-[10px] text-[var(--v2-muted)]" : "text-[10px] text-gray-500",
    dockRowList:
      "max-h-[40vh] overflow-y-auto px-3 py-2 space-y-2 max-w-lg mx-auto",
    dockFinishRow: v2
      ? "flex items-center gap-2 px-4 py-3 border-t border-[var(--v2-border)] bg-[var(--v2-surface)]"
      : "flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-white",
    finishBtn: v2
      ? "flex-1 px-4 py-3 rounded-lg bg-[var(--v2-accent)] text-black text-sm font-bold disabled:opacity-50"
      : "flex-1 px-4 py-3 rounded-lg bg-green-700 text-white text-sm font-bold disabled:opacity-50",
    navBtn: v2
      ? "w-11 h-11 rounded-md border border-[var(--v2-border)] bg-[var(--v2-surface-2)] text-white text-lg leading-none disabled:opacity-30"
      : "w-11 h-11 rounded-md border border-gray-300 bg-white text-gray-800 text-lg leading-none disabled:opacity-30",
    error: v2
      ? "rounded-md bg-red-950/60 border border-red-800 px-3 py-2 text-sm text-red-300"
      : "rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700",
    crown: v2 ? "text-yellow-300" : "text-yellow-500",
    rankBadge: v2
      ? "inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--v2-surface-2)] text-[var(--v2-muted)] text-xs font-bold"
      : "inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-600 text-xs font-bold",
    rankBadgeLeader: v2
      ? "inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--v2-accent)] text-black text-xs font-bold"
      : "inline-flex items-center justify-center w-7 h-7 rounded-full bg-yellow-400 text-yellow-900 text-xs font-bold",
    flash: "rank-flash",
    upArrow: v2 ? "text-[var(--v2-score-soft)]" : "text-green-600",
    downArrow: v2 ? "text-red-400" : "text-red-500",
    vsParPositive: v2 ? "text-red-300" : "text-red-600",
    vsParNegative: v2 ? "text-[var(--v2-accent)]" : "text-green-700",
    vsParEven: v2 ? "text-[var(--v2-muted)]" : "text-gray-500",
  };
}

function vsParLabel(n: number): string {
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : String(n);
}

export function LiveRoundView({ roundId, variant = "classic" }: Props) {
  const cls = styles(variant);
  const v2 = variant === "v2";
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [data, setData] = useState<LiveRoundLoad | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hole, setHole] = useState(1);
  const [pending, setPending] = useState<PendingMap>(new Map());
  const [finishing, setFinishing] = useState(false);

  const prevRanksRef = useRef<Map<string, number>>(new Map());
  const [rankChanges, setRankChanges] = useState<Map<string, "up" | "down" | "flash">>(
    new Map(),
  );

  const load = useCallback(async () => {
    const res = await fetch(`/api/rounds/live/${roundId}`, { cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to load round");
      return;
    }
    setError(null);
    const next = (await res.json()) as LiveRoundLoad;
    setData(next);
    // Only drop pending entries whose server-side state now matches — don't
    // wipe in-flight or queued writes the user just made. A pending value
    // that differs from the server is still "the user's intent" until the
    // mutation succeeds (or the catch handler reverts it).
    setPending((prev) => {
      if (prev.size === 0) return prev;
      const keyOf = (pid: string | null, gn: string | null) =>
        pid ? `u:${pid}` : `g:${(gn ?? "").toLowerCase()}`;
      const serverStrokes = new Map<string, number>();
      for (const s of next.scores) {
        serverStrokes.set(
          `${keyOf(s.player_id, s.guest_name)}:${s.hole_number}`,
          s.strokes,
        );
      }
      const out = new Map(prev);
      for (const [k, v] of prev) {
        if (v === null) {
          if (!serverStrokes.has(k)) out.delete(k); // cleared and confirmed
        } else if (serverStrokes.get(k) === v) {
          out.delete(k); // server caught up
        }
      }
      return out;
    });
  }, [roundId]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      stop();
      timer = setInterval(load, 30_000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        load();
        start();
      } else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user, load]);

  // Resume on the first hole that isn't fully scored.
  useEffect(() => {
    if (!data) return;
    const { holes, players, scores } = data;
    if (holes.length === 0 || players.length === 0) return;
    const filledByHole = new Map<number, number>();
    for (const s of scores) {
      filledByHole.set(s.hole_number, (filledByHole.get(s.hole_number) ?? 0) + 1);
    }
    for (const h of holes) {
      if ((filledByHole.get(h.hole_number) ?? 0) < players.length) {
        setHole(h.hole_number);
        return;
      }
    }
    setHole(holes[holes.length - 1].hole_number);
    // run only on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data === null]);

  // Track leaderboard rank changes between renders for the up/down arrow flash.
  useEffect(() => {
    if (!data) return;
    const next = new Map<string, "up" | "down" | "flash">();
    for (const r of data.leaderboard) {
      const prev = prevRanksRef.current.get(r.key);
      if (prev != null && prev !== r.rank) {
        next.set(r.key, prev > r.rank ? "up" : "down");
      }
    }
    if (next.size > 0) {
      setRankChanges(next);
      const handle = setTimeout(() => setRankChanges(new Map()), 1500);
      // Update reference after the flash arrives so re-renders during the
      // flash window don't keep re-triggering.
      prevRanksRef.current = new Map(
        data.leaderboard.map((r) => [r.key, r.rank]),
      );
      return () => clearTimeout(handle);
    }
    prevRanksRef.current = new Map(
      data.leaderboard.map((r) => [r.key, r.rank]),
    );
  }, [data]);

  const scoreMap = useMemo(() => {
    const m = new Map<string, number>(); // key = `${playerKey}:${hole}` → strokes
    if (!data) return m;
    const keyFor = (playerId: string | null, guestName: string | null) =>
      playerId ? `u:${playerId}` : `g:${(guestName ?? "").toLowerCase()}`;
    for (const s of data.scores) {
      m.set(`${keyFor(s.player_id, s.guest_name)}:${s.hole_number}`, s.strokes);
    }
    for (const [k, v] of pending) {
      if (v === null) m.delete(k);
      else m.set(k, v);
    }
    return m;
  }, [data, pending]);

  // Derive a live "leaderboard" that respects optimistic edits — recompute
  // from scratch using scoreMap so the top card updates in lockstep with the
  // bottom entry buttons.
  const liveLeaderboard: LiveLeaderRow[] = useMemo(() => {
    if (!data) return [];
    const parByHole = new Map(data.holes.map((h) => [h.hole_number, h.par]));
    type Agg = { through: number; strokes: number; vsPar: number };
    const agg = new Map<string, Agg>();
    for (const p of data.players) {
      agg.set(p.key, { through: 0, strokes: 0, vsPar: 0 });
    }
    for (const [k, strokes] of scoreMap) {
      const [pk, holeStr] = (() => {
        const idx = k.lastIndexOf(":");
        return [k.slice(0, idx), k.slice(idx + 1)];
      })();
      const h = Number(holeStr);
      const a = agg.get(pk);
      if (!a) continue;
      a.through += 1;
      a.strokes += strokes;
      a.vsPar += strokes - (parByHole.get(h) ?? 4);
    }
    const rows = data.players.map((p) => {
      const a = agg.get(p.key)!;
      return {
        key: p.key,
        name: p.name,
        is_guest: p.is_guest,
        player_id: p.player_id,
        guest_name: p.guest_name,
        through: a.through,
        strokes: a.strokes,
        vs_par: a.vsPar,
        seq: p.seq,
      };
    });
    rows.sort((a, b) => {
      if (a.through === 0 && b.through > 0) return 1;
      if (b.through === 0 && a.through > 0) return -1;
      if (a.vs_par !== b.vs_par) return a.vs_par - b.vs_par;
      if (a.strokes !== b.strokes) return a.strokes - b.strokes;
      return a.seq - b.seq;
    });
    const out: LiveLeaderRow[] = [];
    let lastVs: number | null = null;
    let lastBucket: number | null = null;
    let rank = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const bucket = r.through === 0 ? 0 : 1;
      const tied = lastVs !== null && r.vs_par === lastVs && bucket === lastBucket;
      if (!tied) rank = i + 1;
      lastVs = r.vs_par;
      lastBucket = bucket;
      out.push({
        key: r.key,
        name: r.name,
        is_guest: r.is_guest,
        player_id: r.player_id,
        guest_name: r.guest_name,
        through: r.through,
        strokes: r.strokes,
        vs_par: r.vs_par,
        rank,
        is_leader: rank === 1 && r.through > 0,
      });
    }
    return out;
  }, [data, scoreMap]);

  if (authLoading || !user) {
    return (
      <div className={`${cls.page} flex items-center justify-center`}>
        <div className={v2 ? "animate-pulse text-[var(--v2-accent)]" : "animate-pulse text-green-700"}>
          Loading…
        </div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className={cls.page}>
        <div className={cls.container}>
          <Link href="/" className={cls.backLink}>← Home</Link>
          <div className={`${cls.error} mt-3`}>{error}</div>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={`${cls.page} flex items-center justify-center`}>
        <div className={v2 ? "animate-pulse text-[var(--v2-accent)]" : "animate-pulse text-green-700"}>
          Loading round…
        </div>
      </div>
    );
  }

  const { round, holes, players } = data;
  const currentHole = holes.find((h) => h.hole_number === hole);
  const currentPar = currentHole?.par ?? 4;

  function setStrokes(playerKey: string, identity: { player_id: string | null; guest_name: string | null }, strokes: number | null) {
    const key = `${playerKey}:${hole}`;
    const prev = pending.get(key);
    const hadPrev = pending.has(key);
    setPending((m) => {
      const next = new Map(m);
      next.set(key, strokes);
      return next;
    });
    setError(null);
    fetchOrQueue(`/api/rounds/live/${roundId}/holes`, {
      method: "POST",
      body: {
        player_id: identity.player_id,
        guest_name: identity.guest_name,
        hole_number: hole,
        strokes,
      },
      label: `live round ${roundId} hole ${hole}`,
    })
      .then(async (res) => {
        if (res === null) return; // queued
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "Save failed");
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Save failed");
        setPending((m) => {
          const next = new Map(m);
          if (hadPrev) next.set(key, prev as number | null);
          else next.delete(key);
          return next;
        });
      });
  }

  async function handleFinish() {
    setFinishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/rounds/live/${roundId}/finish`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Finish failed");
      router.push(`/rounds/${roundId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Finish failed");
    } finally {
      setFinishing(false);
    }
  }

  const minHole = holes[0]?.hole_number ?? 1;
  const maxHole = holes[holes.length - 1]?.hole_number ?? 18;
  const totalCells = holes.length * players.length;
  const filledCells = Array.from(scoreMap.keys()).length;
  const allFilled = totalCells > 0 && filledCells >= totalCells;

  return (
    <div className={cls.page}>
      <style>{`
        @keyframes rank-flash-keyframes {
          0% { background-color: rgba(250, 204, 21, 0.25); }
          100% { background-color: transparent; }
        }
        .rank-flash { animation: rank-flash-keyframes 1.4s ease-out; }
      `}</style>

      <div className={cls.container}>
        <div className="flex items-center justify-between">
          <Link href="/" className={cls.backLink}>← Home</Link>
          <div className="text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className={v2 ? "text-red-300" : "text-red-600"}>LIVE</span>
            <span className={v2 ? "text-[var(--v2-muted)]" : "text-gray-400"}>· {round.course_name}</span>
          </div>
        </div>

        <div className={`${cls.card} mt-3`}>
          <div className={cls.sectionHeader}>Leaderboard</div>
          <div className="mt-2 space-y-1">
            {liveLeaderboard.map((row) => {
              const change = rankChanges.get(row.key);
              const vsParTone =
                row.through === 0
                  ? cls.vsParEven
                  : row.vs_par > 0
                    ? cls.vsParPositive
                    : row.vs_par < 0
                      ? cls.vsParNegative
                      : cls.vsParEven;
              const sameAsPrev =
                liveLeaderboard.findIndex(
                  (r) => r.rank === row.rank && r.key !== row.key,
                ) !== -1;
              return (
                <div
                  key={row.key}
                  className={`${cls.leaderRow} ${change ? "rank-flash" : ""}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={row.is_leader ? cls.rankBadgeLeader : cls.rankBadge}
                    >
                      {sameAsPrev ? `T${row.rank}` : row.rank}
                    </span>
                    <div className="min-w-0">
                      <div className={cls.leaderName + " truncate"}>
                        {row.is_leader && <span className={cls.crown}>👑 </span>}
                        {row.name}
                        {row.is_guest && (
                          <span
                            className={
                              v2
                                ? "ml-1.5 text-[9px] font-semibold uppercase text-[var(--v2-muted)]"
                                : "ml-1.5 text-[9px] font-semibold uppercase text-yellow-700"
                            }
                          >
                            guest
                          </span>
                        )}
                        {change === "up" && (
                          <span className={`ml-1.5 ${cls.upArrow}`}>↑</span>
                        )}
                        {change === "down" && (
                          <span className={`ml-1.5 ${cls.downArrow}`}>↓</span>
                        )}
                      </div>
                      <div className={cls.leaderMeta}>
                        {row.through === 0
                          ? "—"
                          : `${row.strokes} · thru ${row.through}`}
                      </div>
                    </div>
                  </div>
                  <div className={`text-lg font-bold ${vsParTone}`}>
                    {row.through === 0 ? "—" : vsParLabel(row.vs_par)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={cls.holeStripWrap}>
          <div className="flex px-4 gap-1 min-w-max">
            {holes.map((h) => {
              const filled = players.filter((p) =>
                scoreMap.has(`${p.key}:${h.hole_number}`),
              ).length;
              const complete = filled === players.length && players.length > 0;
              const isCurrent = h.hole_number === hole;
              return (
                <button
                  key={h.hole_number}
                  type="button"
                  onClick={() => setHole(h.hole_number)}
                  className={
                    isCurrent
                      ? cls.holeBtnActive
                      : complete
                        ? cls.holeBtnFilled
                        : cls.holeBtnIdle
                  }
                >
                  {h.hole_number}
                </button>
              );
            })}
          </div>
        </div>

        {error && <div className={`${cls.error} mt-3`}>{error}</div>}

        <p
          className={
            v2
              ? "mt-3 text-[11px] text-[var(--v2-muted)]"
              : "mt-3 text-[11px] text-gray-400"
          }
        >
          Anyone with the link can score this round. Edits are logged.
        </p>
      </div>

      <div className={cls.dock}>
        <div className={cls.dockNavRow}>
          <button
            type="button"
            onClick={() => setHole((h) => Math.max(minHole, h - 1))}
            disabled={hole <= minHole}
            className={cls.navBtn}
          >
            ←
          </button>
          <div className={cls.dockHoleBadge}>
            Hole {hole} · Par {currentPar}
            <div className={cls.dockHoleSub}>
              {currentHole?.yardage != null && <>{currentHole.yardage} yds</>}
              {currentHole?.yardage != null && currentHole?.handicap_index != null && <> · </>}
              {currentHole?.handicap_index != null && <>HCP {currentHole.handicap_index}</>}
              {(currentHole?.yardage != null || currentHole?.handicap_index != null) && (
                <> · </>
              )}
              {filledCells}/{totalCells} entered
            </div>
          </div>
          <button
            type="button"
            onClick={() => setHole((h) => Math.min(maxHole, h + 1))}
            disabled={hole >= maxHole}
            className={cls.navBtn}
          >
            →
          </button>
        </div>

        <div className={cls.dockRowList}>
          {players.map((p) => {
            const key = `${p.key}:${hole}`;
            const strokes = scoreMap.get(key);
            const cls2 = strokes != null ? classify(strokes, currentPar, v2) : null;
            const identity = { player_id: p.player_id, guest_name: p.guest_name };
            return (
              <div key={p.key} className={cls.playerRowWrap}>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className={cls.playerName + " truncate"}>
                      {p.name}
                      {p.is_guest && (
                        <span
                          className={
                            v2
                              ? "ml-1.5 text-[9px] font-semibold uppercase text-[var(--v2-muted)]"
                              : "ml-1.5 text-[9px] font-semibold uppercase text-yellow-700"
                          }
                        >
                          guest
                        </span>
                      )}
                    </div>
                    {cls2 && (
                      <span
                        className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded ${cls2.tone}`}
                      >
                        {cls2.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setStrokes(p.key, identity, currentPar)}
                      className={
                        strokes === currentPar ? cls.parBtnActive : cls.parBtnIdle
                      }
                    >
                      Par
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setStrokes(
                          p.key,
                          identity,
                          Math.max(1, (strokes ?? currentPar) - 1),
                        )
                      }
                      className={cls.bigBtn}
                    >
                      −
                    </button>
                    <div className={cls.scoreBox}>
                      <div className={cls.scoreVal}>{strokes ?? "–"}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setStrokes(p.key, identity, (strokes ?? currentPar) + 1)
                      }
                      className={cls.bigBtn}
                    >
                      +
                    </button>
                    {strokes != null && (
                      <button
                        type="button"
                        onClick={() => setStrokes(p.key, identity, null)}
                        className={`ml-1 ${cls.clearBtn}`}
                        title="Clear"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className={cls.dockFinishRow}>
          <button
            type="button"
            onClick={handleFinish}
            disabled={finishing}
            className={cls.finishBtn}
          >
            {finishing
              ? "Saving…"
              : allFilled
                ? "Finish round"
                : `Finish round (${totalCells - filledCells} blank)`}
          </button>
        </div>
      </div>
    </div>
  );
}
