"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { UiModeToggle } from "@/components/ui-mode-toggle";
import { V2Card } from "@/components/v2/card";
import { V2StatTile } from "@/components/v2/stat-tile";
import { V2Pill } from "@/components/v2/pill";
import { V2SectionTitle } from "@/components/v2/section-title";
import type { PlayerStats } from "@/app/api/player/route";

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

  useEffect(() => {
    if (!user) return;
    fetch(`/api/player?key=u:${encodeURIComponent(user.id)}`, {
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
      <div className="flex min-h-screen items-center justify-center bg-[var(--v2-bg)]">
        <div className="animate-pulse text-[var(--v2-accent)]">Loading…</div>
      </div>
    );
  }
  if (!user) return null;

  const initials = user.display_name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-[var(--v2-bg)] text-[var(--v2-fg)]">
      <div className="mx-auto max-w-lg">
      {/* Green header with avatar */}
      <div className="relative bg-gradient-to-b from-green-900 to-green-950 px-4 pb-8 pt-12">
        <h1 className="text-center text-base font-semibold text-white/90">
          Profile
        </h1>
        <div className="mt-6 flex flex-col items-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-[var(--v2-accent)] bg-[var(--v2-surface)] text-3xl font-bold text-[var(--v2-accent)]">
            {initials || "•"}
          </div>
          <div className="mt-3 text-2xl font-bold text-white">
            {user.display_name}
          </div>
          <div className="text-sm text-white/60">@{user.username}</div>
          {user.is_admin && (
            <div className="mt-2 inline-block rounded-full bg-[var(--v2-accent)]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--v2-accent)]">
              admin
            </div>
          )}
          <div className="mt-3">
            <V2Pill
              active={showEdit}
              onClick={() => {
                setShowEdit((v) => !v);
                setNewDisplayName(user.display_name);
                setNewUsername(user.username);
              }}
            >
              <span className="text-base">★</span>
              {showEdit ? "Close" : "Edit profile"}
            </V2Pill>
          </div>
        </div>
      </div>

      {/* Handicap headline + stats row */}
      <div className="-mt-4 space-y-2 px-4">
        <V2Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--v2-accent)]">
                Handicap index
              </div>
              <div className="text-xs text-[var(--v2-muted)]">
                {stats == null
                  ? "Loading…"
                  : stats.handicap_index == null
                    ? `Need ${Math.max(0, 3 - stats.handicap_rounds_used)} more eligible round${stats.handicap_rounds_used === 2 ? "" : "s"}`
                    : `Best of last ${stats.handicap_rounds_used} round${stats.handicap_rounds_used === 1 ? "" : "s"}`}
              </div>
            </div>
            <div className="text-3xl font-bold text-[var(--v2-accent)]">
              {stats?.handicap_index ?? "—"}
            </div>
          </div>
        </V2Card>
        <V2Card>
          <div className="grid grid-cols-3 gap-2">
            <V2StatTile
              label="Rounds"
              value={stats?.rounds_played ?? "—"}
              tone="white"
            />
            <V2StatTile
              label="Avg"
              value={stats?.avg_score ?? "—"}
              trend="up"
              tone="green"
            />
            <V2StatTile
              label="Best"
              value={stats?.best_score ?? "—"}
              tone="gold"
            />
          </div>
        </V2Card>
      </div>

      {/* Edit profile (display name + username) */}
      {showEdit && (
        <div className="mt-4 px-4">
          <V2Card>
            <div className="space-y-3">
              {editError && (
                <div className="rounded-lg bg-red-950/50 px-3 py-2 text-sm text-red-300">
                  {editError}
                </div>
              )}
              {editSuccess && (
                <div className="rounded-lg bg-green-950/50 px-3 py-2 text-sm text-green-300">
                  Profile updated.
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs text-[var(--v2-muted)]">
                  Display name
                </label>
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  maxLength={50}
                  className="w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--v2-muted)]">
                  Username
                </label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  minLength={2}
                  maxLength={20}
                  pattern="[a-zA-Z0-9_]+"
                  className="w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-sm text-white"
                />
                <div className="mt-1 text-xs text-[var(--v2-muted)]">
                  2–20 letters, numbers, or underscores
                </div>
              </div>
              <button
                type="button"
                onClick={saveProfile}
                disabled={editSubmitting}
                className="w-full rounded-lg bg-[var(--v2-accent)] py-2 text-sm font-semibold text-black hover:bg-[var(--v2-accent-soft)] disabled:opacity-50"
              >
                {editSubmitting ? "Saving…" : "Save changes"}
              </button>
            </div>
          </V2Card>
        </div>
      )}

      {/* Best courses */}
      <div className="mt-6 px-4">
        <V2SectionTitle>Best Courses</V2SectionTitle>
        {stats && stats.by_course.length > 0 ? (
          <div className="space-y-2">
            {stats.by_course.slice(0, 5).map((c) => (
              <Link
                key={c.course_id}
                href={`/courses/${c.course_id}`}
                className="block"
              >
                <V2Card className="flex items-center justify-between !p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">
                      {c.course_name}
                    </div>
                    <div className="text-xs text-[var(--v2-muted)]">
                      {c.rounds_played} round{c.rounds_played === 1 ? "" : "s"} ·
                      best {c.best_score}
                    </div>
                  </div>
                  <div className="ml-3 text-2xl font-bold text-[var(--v2-accent)]">
                    {c.avg_score}
                  </div>
                </V2Card>
              </Link>
            ))}
          </div>
        ) : (
          <V2Card>
            <div className="py-4 text-center text-sm text-[var(--v2-muted)]">
              No rounds logged yet.{" "}
              <Link
                href="/rounds/new"
                className="font-medium text-[var(--v2-accent)] hover:underline"
              >
                Log your first →
              </Link>
            </div>
          </V2Card>
        )}
      </div>

      {/* Change password (collapsible) */}
      <div className="mt-6 px-4">
        <V2Card>
          <button
            type="button"
            onClick={() => setShowPwd((v) => !v)}
            className="flex w-full items-center justify-between text-sm font-semibold text-white"
          >
            <span>Change password</span>
            <span className="text-[var(--v2-muted)]">{showPwd ? "−" : "+"}</span>
          </button>
          {showPwd && (
            <form onSubmit={changePassword} className="mt-3 space-y-3">
              {pwdError && (
                <div className="rounded-lg bg-red-950/50 px-3 py-2 text-sm text-red-300">
                  {pwdError}
                </div>
              )}
              {pwdSuccess && (
                <div className="rounded-lg bg-green-950/50 px-3 py-2 text-sm text-green-300">
                  Password updated.
                </div>
              )}
              <input
                type="password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                placeholder="Current password"
                autoComplete="current-password"
                className="w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-sm text-white placeholder-[var(--v2-muted)]"
                required
              />
              <input
                type="password"
                value={nextPwd}
                onChange={(e) => setNextPwd(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                minLength={4}
                className="w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-sm text-white placeholder-[var(--v2-muted)]"
                required
              />
              <input
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
                minLength={4}
                className="w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-sm text-white placeholder-[var(--v2-muted)]"
                required
              />
              <button
                type="submit"
                disabled={pwdSubmitting}
                className="w-full rounded-lg bg-[var(--v2-score)] py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
              >
                {pwdSubmitting ? "Saving…" : "Update password"}
              </button>
            </form>
          )}
        </V2Card>
      </div>

      {/* App appearance + admin + sign out */}
      <div className="mt-6 space-y-3 px-4 pb-8">
        <V2Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">
                App appearance
              </div>
              <div className="text-xs text-[var(--v2-muted)]">
                You&apos;re using the new UI
              </div>
            </div>
            <UiModeToggle currentMode="v2" style="v2" />
          </div>
        </V2Card>

        {user.is_admin && (
          <Link
            href="/admin"
            className="block rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-4 py-3 text-center text-sm font-medium text-white hover:bg-[var(--v2-surface-2)]"
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
      </div>
    </div>
  );
}
