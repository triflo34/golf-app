"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { V2PageShell } from "@/components/v2/page-shell";
import { V2Avatar, toneForName } from "@/components/v2/avatar";
import type { PlayerStats } from "@/app/api/player/route";

function usePlayer(playerId: string, viewerId: string | null) {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const vs = viewerId && viewerId !== playerId ? `&vs=u:${encodeURIComponent(viewerId)}` : "";
    fetch(`/api/player?key=u:${encodeURIComponent(playerId)}${vs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load player"))))
      .then((d: PlayerStats) => setStats(d))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load player"));
  }, [playerId, viewerId]);
  return { stats, error };
}

function hcp(stats: PlayerStats): string {
  return stats.handicap_index == null ? "—" : stats.handicap_index.toFixed(1);
}
function dateShort(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/* ------------------------------- v2 ------------------------------- */

export function V2PlayerProfileFull({ playerId }: { playerId: string }) {
  const { user } = useAuth();
  const { stats, error } = usePlayer(playerId, user?.id ?? null);
  const h2h = stats?.head_to_head ?? null;

  return (
    <V2PageShell>
      <Link href="#" onClick={(e) => { e.preventDefault(); history.back(); }} className="text-sm text-[var(--v2-gold)]">
        ← Back
      </Link>
      {error ? (
        <div className="mt-3 rounded-lg border border-[var(--v2-danger-border)] bg-[var(--v2-danger-bg)] px-3 py-2 text-sm text-[var(--v2-red-text)]">{error}</div>
      ) : !stats ? (
        <div className="mt-8 text-center text-sm text-[var(--v2-text-dim)]">Loading…</div>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-3">
            <V2Avatar initial={(stats.name.charAt(0) || "?").toUpperCase()} tone={toneForName(stats.name)} size={56} />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-[var(--v2-text)]" style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}>
                {stats.name}
              </h1>
              <div className="text-sm text-[var(--v2-text-dim)]">
                Handicap <span className="font-semibold text-[var(--v2-gold)]">{hcp(stats)}</span>
                {stats.handicap_rounds_used > 0 && (
                  <span className="text-[var(--v2-text-faint)]"> · {stats.handicap_rounds_used} rds</span>
                )}
              </div>
            </div>
          </div>

          {h2h && (
            <div className="mt-4 rounded-lg border border-[var(--v2-gold)]/30 bg-[var(--v2-gold)]/8 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-[var(--v2-gold)]">Head-to-head vs you</div>
              <div className="mt-0.5 text-sm text-[var(--v2-text)]">
                <span className="font-semibold">{stats.name} {h2h.wins}</span>
                <span className="text-[var(--v2-text-dim)]"> · You {h2h.losses}</span>
                {h2h.ties > 0 && <span className="text-[var(--v2-text-dim)]"> · {h2h.ties} tied</span>}
                <span className="text-[var(--v2-text-faint)]"> over {h2h.rounds} rounds</span>
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { label: "Rounds", value: stats.rounds_played },
              { label: "Wins", value: stats.total_wins },
              { label: "Avg", value: stats.avg_score ?? "—" },
              { label: "Best 18", value: stats.best_score_18 ?? "—" },
              { label: "Avg 18", value: stats.avg_score_18 ?? "—" },
              { label: "Best 9", value: stats.best_score_9 ?? "—" },
            ].map((t) => (
              <div key={t.label} className="v2-card text-center">
                <div className="text-lg font-bold text-[var(--v2-text)]" style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}>
                  {t.value}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--v2-text-faint)]">{t.label}</div>
              </div>
            ))}
          </div>

          {stats.by_course.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-[var(--v2-text-faint)]">By course</div>
              <ul className="v2-card divide-y divide-[var(--v2-border)] !p-0">
                {stats.by_course.map((c) => (
                  <li key={c.course_id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-[var(--v2-text)]">{c.course_name}</span>
                    <span className="text-xs text-[var(--v2-text-dim)]">{c.rounds_played} rds</span>
                    <span className="w-12 text-right text-xs text-[var(--v2-text-dim)]">avg {c.avg_score}</span>
                    <span className="w-12 text-right font-semibold text-[var(--v2-text)]">{c.best_score}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {stats.recent.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-[var(--v2-text-faint)]">Recent rounds</div>
              <ul className="v2-card divide-y divide-[var(--v2-border)] !p-0">
                {stats.recent.slice(0, 10).map((r) => (
                  <li key={r.round_id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="w-16 text-xs text-[var(--v2-text-faint)]">{dateShort(r.played_at)}</span>
                    <span className="min-w-0 flex-1 truncate text-[var(--v2-text-dim)]">{r.course_name}</span>
                    {r.placement != null && r.field_size >= 2 && (
                      <span className="text-xs text-[var(--v2-text-faint)]">{r.placement}/{r.field_size}</span>
                    )}
                    <span className="w-8 text-right font-semibold text-[var(--v2-text)]">{r.gross_score}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </V2PageShell>
  );
}

/* ----------------------------- classic ----------------------------- */

export function ClassicPlayerProfileFull({ playerId }: { playerId: string }) {
  const { user } = useAuth();
  const { stats, error } = usePlayer(playerId, user?.id ?? null);
  const h2h = stats?.head_to_head ?? null;

  return (
    <div className="mx-auto max-w-lg px-4 py-5">
      <button type="button" onClick={() => history.back()} className="text-sm text-green-700">
        ← Back
      </button>
      {error ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : !stats ? (
        <div className="mt-8 text-center text-sm text-gray-500">Loading…</div>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-700 text-xl font-bold text-white">
              {(stats.name.charAt(0) || "?").toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-gray-900">{stats.name}</h1>
              <div className="text-sm text-gray-500">
                Handicap <span className="font-semibold text-green-700">{hcp(stats)}</span>
                {stats.handicap_rounds_used > 0 && <span className="text-gray-400"> · {stats.handicap_rounds_used} rds</span>}
              </div>
            </div>
          </div>

          {h2h && (
            <div className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-green-700">Head-to-head vs you</div>
              <div className="mt-0.5 text-sm text-gray-900">
                <span className="font-semibold">{stats.name} {h2h.wins}</span>
                <span className="text-gray-500"> · You {h2h.losses}</span>
                {h2h.ties > 0 && <span className="text-gray-500"> · {h2h.ties} tied</span>}
                <span className="text-gray-400"> over {h2h.rounds} rounds</span>
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { label: "Rounds", value: stats.rounds_played },
              { label: "Wins", value: stats.total_wins },
              { label: "Avg", value: stats.avg_score ?? "—" },
              { label: "Best 18", value: stats.best_score_18 ?? "—" },
              { label: "Avg 18", value: stats.avg_score_18 ?? "—" },
              { label: "Best 9", value: stats.best_score_9 ?? "—" },
            ].map((t) => (
              <div key={t.label} className="rounded-md border border-gray-200 bg-white px-2 py-2 text-center">
                <div className="text-lg font-bold text-gray-900">{t.value}</div>
                <div className="text-[10px] uppercase tracking-wide text-gray-400">{t.label}</div>
              </div>
            ))}
          </div>

          {stats.by_course.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-gray-400">By course</div>
              <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
                {stats.by_course.map((c) => (
                  <li key={c.course_id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-gray-900">{c.course_name}</span>
                    <span className="text-xs text-gray-500">{c.rounds_played} rds</span>
                    <span className="w-12 text-right text-xs text-gray-500">avg {c.avg_score}</span>
                    <span className="w-12 text-right font-semibold text-gray-900">{c.best_score}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {stats.recent.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-gray-400">Recent rounds</div>
              <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
                {stats.recent.slice(0, 10).map((r) => (
                  <li key={r.round_id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="w-16 text-xs text-gray-400">{dateShort(r.played_at)}</span>
                    <span className="min-w-0 flex-1 truncate text-gray-500">{r.course_name}</span>
                    {r.placement != null && r.field_size >= 2 && (
                      <span className="text-xs text-gray-400">{r.placement}/{r.field_size}</span>
                    )}
                    <span className="w-8 text-right font-semibold text-gray-900">{r.gross_score}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
