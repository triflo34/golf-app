"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { UiModeToggle } from "@/components/ui-mode-toggle";
import { V2PageShell } from "@/components/v2/page-shell";
import { V2Card } from "@/components/v2/card";
import { V2StatTile } from "@/components/v2/stat-tile";
import { V2SectionTitle } from "@/components/v2/section-title";
import { V2Avatar } from "@/components/v2/avatar";
import type { PlayerStats } from "@/app/api/player/route";

/** Layered hill silhouette behind the avatar — spec §7.5 banner. */
function HillsBackdrop() {
  return (
    <svg
      className="absolute inset-x-0 bottom-0 h-20 w-full"
      viewBox="0 0 400 80"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <path d="M0 80 V46 Q70 18 150 40 T400 34 V80 Z" fill="rgba(10,15,10,0.35)" />
      <path d="M0 80 V58 Q110 34 210 52 T400 50 V80 Z" fill="rgba(8,13,8,0.55)" />
    </svg>
  );
}

export function V2Profile() {
  const { user, loading, signOut, refresh } = useAuth();
  const [stats, setStats] = useState<PlayerStats | null>(null);

  const [showEdit, setShowEdit] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [showPwd, setShowPwd] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [nextPwd, setNextPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState(false);
  const [pwdSubmitting, setPwdSubmitting] = useState(false);

  const [showHcDetails, setShowHcDetails] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch(`/api/player?key=u:${encodeURIComponent(user.id)}&details=1`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setStats(d));
  }, [user]);

  async function saveProfile() {
    if (!user) return;
    setEditError("");
    setEditSuccess(false);
    setEditSubmitting(true);
    try {
      if (newDisplayName && newDisplayName !== user.display_name) {
        const res = await fetch("/api/me/display-name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_name: newDisplayName }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? "Display name change failed");
        }
      }
      if (newUsername && newUsername !== user.username) {
        const res = await fetch("/api/me/username", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: newUsername }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? "Username change failed");
        }
      }
      setEditSuccess(true);
      await refresh();
      setNewDisplayName("");
      setNewUsername("");
      setTimeout(() => {
        setEditSuccess(false);
        setShowEdit(false);
      }, 1500);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError("");
    setPwdSuccess(false);
    if (nextPwd !== confirmPwd) {
      setPwdError("Passwords don't match");
      return;
    }
    setPwdSubmitting(true);
    const res = await fetch("/api/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current: currentPwd, next: nextPwd }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setPwdError(d.error ?? "Change failed");
      setPwdSubmitting(false);
      return;
    }
    setPwdSuccess(true);
    setCurrentPwd("");
    setNextPwd("");
    setConfirmPwd("");
    setPwdSubmitting(false);
  }

  if (loading) {
    return (
      <div className="v2-bg flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-[var(--v2-gold)]">Loading…</div>
      </div>
    );
  }
  if (!user) return null;

  const initials =
    user.display_name
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "•";

  const bests = [stats?.best_score_18, stats?.best_score_9].filter(
    (v): v is number => v != null,
  );
  const bestOverall = bests.length ? Math.min(...bests) : null;

  const serif = { fontFamily: "var(--font-fraunces), Georgia, serif" };

  const banner = (
    <div
      className="relative h-[132px] overflow-hidden"
      style={{
        background:
          "linear-gradient(165deg, #2a472a 0%, #1a2e1a 55%, var(--v2-bg-1) 100%)",
      }}
    >
      <HillsBackdrop />
      <div className="absolute left-0 right-0 top-3 text-center">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--v2-gold)]/70"
          style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
        >
          Profile
        </span>
      </div>
    </div>
  );

  return (
    <V2PageShell header={banner}>
      {/* Avatar overlaps the banner edge */}
      <div className="-mt-[60px] flex flex-col items-center">
        <V2Avatar initial={initials} size={92} leader />
        <div className="mt-2.5 text-[22px] font-medium leading-tight text-[var(--v2-text)]" style={serif}>
          {user.display_name}
        </div>
        <div className="text-sm text-[var(--v2-text-dim)]">@{user.username}</div>
        {user.is_admin && (
          <div className="mt-1.5 rounded-full bg-[var(--v2-gold)]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--v2-gold)]">
            admin
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setShowEdit((v) => !v);
            setNewDisplayName(user.display_name);
            setNewUsername(user.username);
          }}
          className="mt-3 rounded-full border border-[var(--v2-gold)]/40 px-4 py-1.5 text-xs font-medium text-[var(--v2-gold)] hover:bg-[var(--v2-gold)]/10"
        >
          {showEdit ? "Close" : "Edit profile"}
        </button>
      </div>

      {/* Stat trio: Index / Rounds / Best */}
      <div className="mt-5 grid grid-cols-3 gap-2">
        <V2StatTile label="Index" value={stats?.handicap_index ?? "—"} tone="gold" />
        <V2StatTile label="Rounds" value={stats?.rounds_played ?? "—"} tone="white" />
        <V2StatTile label="Best" value={bestOverall ?? "—"} tone="green" />
      </div>

      {/* Edit profile (display name + username) */}
      {showEdit && (
        <V2Card className="mt-3">
          <div className="space-y-3">
            {editError && (
              <div className="rounded-lg bg-red-950/50 px-3 py-2 text-sm text-red-300">{editError}</div>
            )}
            {editSuccess && (
              <div className="rounded-lg bg-green-950/50 px-3 py-2 text-sm text-green-300">Profile updated.</div>
            )}
            <div>
              <label className="mb-1 block text-xs text-[var(--v2-text-dim)]">Display name</label>
              <input
                type="text"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                maxLength={50}
                className="w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-sm text-[var(--v2-text)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--v2-text-dim)]">Username</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                minLength={2}
                maxLength={20}
                pattern="[a-zA-Z0-9_]+"
                className="w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-sm text-[var(--v2-text)]"
              />
              <div className="mt-1 text-xs text-[var(--v2-text-dim)]">
                2–20 letters, numbers, or underscores
              </div>
            </div>
            <button
              type="button"
              onClick={saveProfile}
              disabled={editSubmitting}
              className="w-full rounded-lg bg-[var(--v2-gold)] py-2 text-sm font-semibold text-[var(--v2-green-deep)] hover:bg-[var(--v2-gold-bright)] disabled:opacity-50"
            >
              {editSubmitting ? "Saving…" : "Save changes"}
            </button>
          </div>
        </V2Card>
      )}

      {/* Handicap headline + per-round details */}
      <V2Card className="mt-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--v2-gold)]">
              Handicap index
            </div>
            <div className="text-xs text-[var(--v2-text-dim)]">
              {stats == null
                ? "Loading…"
                : stats.handicap_index == null
                  ? `Need ${Math.max(0, 3 - stats.handicap_rounds_used)} more eligible round${stats.handicap_rounds_used === 2 ? "" : "s"}`
                  : `Avg lowest ${stats.handicap_best_n} of ${stats.handicap_rounds_used} round${stats.handicap_rounds_used === 1 ? "" : "s"}${stats.handicap_adjustment < 0 ? ` − ${Math.abs(stats.handicap_adjustment).toFixed(1)}` : ""}`}
            </div>
            {stats != null && stats.handicap_rounds_skipped > 0 && (
              <div className="mt-1 text-xs text-[var(--v2-amber-warn)]">
                {stats.handicap_rounds_skipped} round
                {stats.handicap_rounds_skipped === 1 ? "" : "s"} skipped — missing rating
              </div>
            )}
          </div>
          <div className="text-3xl font-bold text-[var(--v2-gold)]" style={serif}>
            {stats?.handicap_index ?? "—"}
          </div>
        </div>
        {stats != null && (stats.handicap_rounds?.length ?? 0) > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowHcDetails((v) => !v)}
              className="mt-3 text-xs font-medium text-[var(--v2-gold)]"
            >
              {showHcDetails ? "Hide details" : "Show per-round details"}
            </button>
            {showHcDetails && (
              <div className="mt-3 space-y-1 border-t border-[var(--v2-border)] pt-3">
                {stats.handicap_rounds!.map((r) => (
                  <div key={r.round_id} className="flex items-center justify-between text-xs">
                    <div className="min-w-0 flex-1">
                      <span className="text-[var(--v2-text)]">{r.course_name}</span>
                      <span className="ml-1 text-[var(--v2-text-dim)]">
                        {r.hole_count === 9 ? `· 9 (${r.nine_played ?? "front"})` : ""}
                      </span>
                      <span className="ml-1 text-[var(--v2-text-dim)]">· {r.gross_score}</span>
                    </div>
                    <div className="ml-2 shrink-0 tabular-nums">
                      {r.differential == null ? (
                        <span className="text-[var(--v2-amber-warn)]">
                          skipped (
                          {r.skip_reason === "missing_18_rating" ? "no 18-hole rating" : "no 9-hole rating"}
                          )
                        </span>
                      ) : (
                        <span
                          className={
                            r.used_in_index
                              ? "font-bold text-[var(--v2-gold)]"
                              : "text-[var(--v2-text-dim)]"
                          }
                        >
                          {r.differential.toFixed(1)}
                          {r.estimated ? "*" : ""}
                          {r.used_in_index ? " ★" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <div className="pt-2 text-[10px] text-[var(--v2-text-dim)]">
                  ★ = used in best-{stats.handicap_best_n} average · * = estimated from 18-hole rating
                </div>
              </div>
            )}
          </>
        )}
      </V2Card>

      {/* 18 / 9 hole splits */}
      {(stats?.rounds_played_18 ?? 0) > 0 && (
        <V2Card className="mt-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--v2-text-dim)]">
            18 holes
          </div>
          <div className="grid grid-cols-3 gap-2">
            <V2StatTile label="Rounds" value={stats?.rounds_played_18 ?? "—"} tone="white" />
            <V2StatTile label="Avg" value={stats?.avg_score_18 ?? "—"} trend="up" tone="green" />
            <V2StatTile label="Best" value={stats?.best_score_18 ?? "—"} tone="gold" />
          </div>
        </V2Card>
      )}
      {(stats?.rounds_played_9 ?? 0) > 0 && (
        <V2Card className="mt-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--v2-text-dim)]">
            9 holes
          </div>
          <div className="grid grid-cols-3 gap-2">
            <V2StatTile label="Rounds" value={stats?.rounds_played_9 ?? "—"} tone="white" />
            <V2StatTile label="Avg" value={stats?.avg_score_9 ?? "—"} trend="up" tone="green" />
            <V2StatTile label="Best" value={stats?.best_score_9 ?? "—"} tone="gold" />
          </div>
        </V2Card>
      )}

      {/* Best courses */}
      <div className="mt-6">
        <V2SectionTitle>Best Courses</V2SectionTitle>
        {stats && stats.by_course.length > 0 ? (
          <div className="mt-2 space-y-2">
            {stats.by_course.slice(0, 5).map((c) => (
              <Link key={c.course_id} href={`/courses/${c.course_id}`} className="block">
                <V2Card className="flex items-center justify-between !p-3" interactive>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[var(--v2-text)]">
                      {c.course_name}
                    </div>
                    <div className="text-xs text-[var(--v2-text-dim)]">
                      {c.rounds_played} round{c.rounds_played === 1 ? "" : "s"} · best {c.best_score}
                    </div>
                  </div>
                  <div className="ml-3 text-2xl font-bold text-[var(--v2-gold)]" style={serif}>
                    {c.avg_score}
                  </div>
                </V2Card>
              </Link>
            ))}
          </div>
        ) : (
          <V2Card className="mt-2">
            <div className="py-4 text-center text-sm text-[var(--v2-text-dim)]">
              No rounds logged yet.{" "}
              <Link href="/rounds/new" className="font-medium text-[var(--v2-gold)] hover:underline">
                Log your first →
              </Link>
            </div>
          </V2Card>
        )}
      </div>

      {/* Change password (collapsible) */}
      <V2Card className="mt-6">
        <button
          type="button"
          onClick={() => setShowPwd((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-semibold text-[var(--v2-text)]"
        >
          <span>Change password</span>
          <span className="text-[var(--v2-text-dim)]">{showPwd ? "−" : "+"}</span>
        </button>
        {showPwd && (
          <form onSubmit={changePassword} className="mt-3 space-y-3">
            {pwdError && (
              <div className="rounded-lg bg-red-950/50 px-3 py-2 text-sm text-red-300">{pwdError}</div>
            )}
            {pwdSuccess && (
              <div className="rounded-lg bg-green-950/50 px-3 py-2 text-sm text-green-300">Password updated.</div>
            )}
            <input
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              placeholder="Current password"
              autoComplete="current-password"
              className="w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-sm text-[var(--v2-text)] placeholder-[var(--v2-text-dim)]"
              required
            />
            <input
              type="password"
              value={nextPwd}
              onChange={(e) => setNextPwd(e.target.value)}
              placeholder="New password"
              autoComplete="new-password"
              minLength={4}
              className="w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-sm text-[var(--v2-text)] placeholder-[var(--v2-text-dim)]"
              required
            />
            <input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              minLength={4}
              className="w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-sm text-[var(--v2-text)] placeholder-[var(--v2-text-dim)]"
              required
            />
            <button
              type="submit"
              disabled={pwdSubmitting}
              className="w-full rounded-lg bg-[var(--v2-sage)] py-2 text-sm font-semibold text-[var(--v2-green-deep)] hover:opacity-90 disabled:opacity-50"
            >
              {pwdSubmitting ? "Saving…" : "Update password"}
            </button>
          </form>
        )}
      </V2Card>

      {/* App appearance + admin + sign out */}
      <div className="mt-6 space-y-3">
        <V2Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-[var(--v2-text)]">App appearance</div>
              <div className="text-xs text-[var(--v2-text-dim)]">You&apos;re using the new UI</div>
            </div>
            <UiModeToggle currentMode="v2" style="v2" />
          </div>
        </V2Card>

        {user.is_admin && (
          <Link
            href="/admin"
            className="block rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-4 py-3 text-center text-sm font-medium text-[var(--v2-text)] hover:border-[var(--v2-gold)]/30"
          >
            Admin tools →
          </Link>
        )}

        <button
          onClick={signOut}
          className="w-full rounded-2xl border border-red-900 bg-red-950/50 px-4 py-3 text-sm font-semibold text-red-300 hover:bg-red-950"
        >
          Sign Out
        </button>
      </div>
    </V2PageShell>
  );
}
