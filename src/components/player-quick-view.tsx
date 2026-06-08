"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { V2Avatar, toneForName } from "@/components/v2/avatar";
import type { PlayerStats } from "@/app/api/player/route";

/** Fetch a player's stats card, optionally with head-to-head vs the viewer. */
function usePlayerCard(playerId: string | null, viewerId: string | null) {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playerId) {
      setStats(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setStats(null);
    setError(null);
    const vs = viewerId && viewerId !== playerId ? `&vs=u:${encodeURIComponent(viewerId)}` : "";
    fetch(`/api/player?key=u:${encodeURIComponent(playerId)}${vs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load player"))))
      .then((d: PlayerStats) => {
        if (!cancelled) setStats(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load player");
      });
    return () => {
      cancelled = true;
    };
  }, [playerId, viewerId]);

  return { stats, error };
}

// Close on Escape for keyboard users.
function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
}

function hcp(stats: PlayerStats): string {
  return stats.handicap_index == null ? "—" : stats.handicap_index.toFixed(1);
}

function placementLabel(p: { placement: number | null; field_size: number }): string | null {
  if (p.placement == null || p.field_size < 2) return null;
  return `${p.placement} of ${p.field_size}`;
}

function dateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ----------------------------- v2 (dark) ----------------------------- */

export function V2PlayerQuickView({
  playerId,
  viewerId,
  onClose,
}: {
  playerId: string | null;
  viewerId: string | null;
  onClose: () => void;
}) {
  const { stats, error } = usePlayerCard(playerId, viewerId);
  useEscape(onClose);
  if (!playerId) return null;
  const h2h = stats?.head_to_head ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onClose}
    >
      <div
        className="v2-card w-full max-w-md rounded-b-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {error ? (
          <div className="py-6 text-center text-sm text-[var(--v2-red-text)]">{error}</div>
        ) : !stats ? (
          <div className="py-8 text-center text-sm text-[var(--v2-text-dim)]">Loading…</div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <V2Avatar initial={(stats.name.charAt(0) || "?").toUpperCase()} tone={toneForName(stats.name)} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold text-[var(--v2-text)]">{stats.name}</div>
                <div className="text-xs text-[var(--v2-text-dim)]">
                  Handicap <span className="font-semibold text-[var(--v2-gold)]">{hcp(stats)}</span>
                </div>
              </div>
              <button type="button" onClick={onClose} className="text-xl leading-none text-[var(--v2-text-faint)]">
                ×
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { label: "Rounds", value: stats.rounds_played },
                { label: "Wins", value: stats.total_wins },
                { label: "Avg 18", value: stats.avg_score_18 ?? "—" },
              ].map((t) => (
                <div key={t.label} className="rounded-lg bg-[var(--v2-surface-2)]/50 px-2 py-2 text-center">
                  <div
                    className="text-lg font-bold text-[var(--v2-text)]"
                    style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
                  >
                    {t.value}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--v2-text-faint)]">{t.label}</div>
                </div>
              ))}
            </div>

            {h2h && (
              <div className="mt-3 rounded-lg border border-[var(--v2-gold)]/30 bg-[var(--v2-gold)]/8 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-[var(--v2-gold)]">Head-to-head vs you</div>
                <div className="mt-0.5 text-sm text-[var(--v2-text)]">
                  <span className="font-semibold">{stats.name} {h2h.wins}</span>
                  <span className="text-[var(--v2-text-dim)]"> · You {h2h.losses}</span>
                  {h2h.ties > 0 && <span className="text-[var(--v2-text-dim)]"> · {h2h.ties} tied</span>}
                  <span className="text-[var(--v2-text-faint)]"> ({h2h.rounds} rds)</span>
                </div>
              </div>
            )}

            {stats.recent.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-[var(--v2-text-faint)]">Recent form</div>
                <ul className="divide-y divide-[var(--v2-border)]">
                  {stats.recent.slice(0, 5).map((r) => {
                    const pl = placementLabel(r);
                    return (
                      <li key={r.round_id} className="flex items-center gap-2 py-1.5 text-xs">
                        <span className="w-10 text-[var(--v2-text-faint)]">{dateShort(r.played_at)}</span>
                        <span className="min-w-0 flex-1 truncate text-[var(--v2-text-dim)]">{r.course_name}</span>
                        {pl && <span className="text-[var(--v2-text-faint)]">{pl}</span>}
                        <span className="w-8 text-right font-semibold text-[var(--v2-text)]">{r.gross_score}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <Link
              href={`/profile/${playerId}`}
              className="mt-3 block rounded-lg bg-[var(--v2-surface-2)]/60 py-2 text-center text-sm font-medium text-[var(--v2-gold)]"
            >
              View full profile →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

/* --------------------------- classic (light) --------------------------- */

export function ClassicPlayerQuickView({
  playerId,
  viewerId,
  onClose,
}: {
  playerId: string | null;
  viewerId: string | null;
  onClose: () => void;
}) {
  const { stats, error } = usePlayerCard(playerId, viewerId);
  useEscape(onClose);
  if (!playerId) return null;
  const h2h = stats?.head_to_head ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {error ? (
          <div className="py-6 text-center text-sm text-red-600">{error}</div>
        ) : !stats ? (
          <div className="py-8 text-center text-sm text-gray-500">Loading…</div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-green-700 text-lg font-bold text-white">
                {(stats.name.charAt(0) || "?").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold text-gray-900">{stats.name}</div>
                <div className="text-xs text-gray-500">
                  Handicap <span className="font-semibold text-green-700">{hcp(stats)}</span>
                </div>
              </div>
              <button type="button" onClick={onClose} className="text-xl leading-none text-gray-400">
                ×
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { label: "Rounds", value: stats.rounds_played },
                { label: "Wins", value: stats.total_wins },
                { label: "Avg 18", value: stats.avg_score_18 ?? "—" },
              ].map((t) => (
                <div key={t.label} className="rounded-lg bg-gray-50 px-2 py-2 text-center">
                  <div className="text-lg font-bold text-gray-900">{t.value}</div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-400">{t.label}</div>
                </div>
              ))}
            </div>

            {h2h && (
              <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-green-700">Head-to-head vs you</div>
                <div className="mt-0.5 text-sm text-gray-900">
                  <span className="font-semibold">{stats.name} {h2h.wins}</span>
                  <span className="text-gray-500"> · You {h2h.losses}</span>
                  {h2h.ties > 0 && <span className="text-gray-500"> · {h2h.ties} tied</span>}
                  <span className="text-gray-400"> ({h2h.rounds} rds)</span>
                </div>
              </div>
            )}

            {stats.recent.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-gray-400">Recent form</div>
                <ul className="divide-y divide-gray-100">
                  {stats.recent.slice(0, 5).map((r) => {
                    const pl = placementLabel(r);
                    return (
                      <li key={r.round_id} className="flex items-center gap-2 py-1.5 text-xs">
                        <span className="w-10 text-gray-400">{dateShort(r.played_at)}</span>
                        <span className="min-w-0 flex-1 truncate text-gray-500">{r.course_name}</span>
                        {pl && <span className="text-gray-400">{pl}</span>}
                        <span className="w-8 text-right font-semibold text-gray-900">{r.gross_score}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <Link
              href={`/profile/${playerId}`}
              className="mt-3 block rounded-lg bg-gray-100 py-2 text-center text-sm font-medium text-green-700"
            >
              View full profile →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
