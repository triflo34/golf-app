"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { UiModeToggle } from "@/components/ui-mode-toggle";
import type { PlayerStats } from "@/app/api/player/route";

export function ClassicProfile() {
  const { user, loading, signOut, refresh } = useAuth();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [showDisplayName, setShowDisplayName] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [displayNameError, setDisplayNameError] = useState("");
  const [displayNameSuccess, setDisplayNameSuccess] = useState(false);
  const [displayNameSubmitting, setDisplayNameSubmitting] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [usernameSuccess, setUsernameSuccess] = useState(false);
  const [usernameSubmitting, setUsernameSubmitting] = useState(false);
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

  async function changeDisplayName(e: React.FormEvent) {
    e.preventDefault();
    setDisplayNameError("");
    setDisplayNameSuccess(false);
    setDisplayNameSubmitting(true);
    const res = await fetch("/api/me/display-name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: newDisplayName }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setDisplayNameError(d.error ?? "Change failed");
      setDisplayNameSubmitting(false);
      return;
    }
    setDisplayNameSuccess(true);
    setNewDisplayName("");
    setDisplayNameSubmitting(false);
    await refresh();
    setTimeout(() => setShowDisplayName(false), 1500);
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-green-700 text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-green-800 mb-4">Profile</h1>

      <div className="card mb-4">
        <div className="text-sm text-gray-500">Display name</div>
        <div className="text-lg font-semibold text-gray-800">
          {user.display_name}
        </div>

        <div className="mt-3 text-sm text-gray-500">Username</div>
        <div className="text-lg font-semibold text-gray-800">
          @{user.username}
        </div>

        {user.is_admin && (
          <div className="mt-3 inline-block text-xs font-semibold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded">
            admin
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowDisplayName((v) => !v)}
          className="mt-3 text-sm font-medium text-blue-700 hover:text-blue-800"
        >
          Edit profile
        </button>
        {showDisplayName && (
          <form onSubmit={changeDisplayName} className="mt-3 space-y-3 pt-3 border-t border-gray-200">
            {displayNameError && (
              <div className="bg-red-50 text-red-600 text-sm p-2.5 rounded-lg">
                {displayNameError}
              </div>
            )}
            {displayNameSuccess && (
              <div className="bg-green-50 text-green-700 text-sm p-2.5 rounded-lg">
                Display name updated.
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Display name</label>
              <input
                type="text"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder={user.display_name}
                maxLength={50}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                required
              />
              <div className="text-xs text-gray-500 mt-1">Up to 50 characters</div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Username</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder={user.username}
                minLength={2}
                maxLength={20}
                pattern="[a-zA-Z0-9_]+"
                title="2-20 letters, numbers, or underscores"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
              />
              <div className="text-xs text-gray-500 mt-1">2–20 letters, numbers, or underscores</div>
            </div>
            {usernameError && (
              <div className="bg-red-50 text-red-600 text-sm p-2.5 rounded-lg">
                {usernameError}
              </div>
            )}
            {usernameSuccess && (
              <div className="bg-green-50 text-green-700 text-sm p-2.5 rounded-lg">
                Username updated.
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowDisplayName(false)}
              className="w-full py-2 bg-white text-gray-600 border border-gray-200 font-medium rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async (e) => {
                if (newDisplayName) {
                  await changeDisplayName(e as unknown as React.FormEvent);
                }
                if (newUsername && newUsername !== user.username) {
                  setUsernameSubmitting(true);
                  const res = await fetch("/api/me/username", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username: newUsername }),
                  });
                  if (!res.ok) {
                    const d = await res.json().catch(() => ({}));
                    setUsernameError(d.error ?? "Change failed");
                    setUsernameSubmitting(false);
                    return;
                  }
                  setUsernameSuccess(true);
                  await refresh();
                  setTimeout(() => {
                    setNewUsername("");
                    setShowDisplayName(false);
                  }, 1500);
                }
              }}
              disabled={displayNameSubmitting || usernameSubmitting}
              className="w-full py-2 bg-blue-700 text-white font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 transition"
            >
              {displayNameSubmitting || usernameSubmitting ? "Saving..." : "Save changes"}
            </button>
          </form>
        )}
      </div>

      <div className="card mb-4">
        <h2 className="font-semibold text-gray-800 mb-3 text-sm">Your record</h2>
        {!stats ? (
          <div className="text-center py-6 text-gray-400 text-sm">Loading...</div>
        ) : stats.rounds_played === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">
            <p>No rounds logged yet.</p>
            <Link
              href="/rounds/new"
              className="inline-block mt-2 text-sm font-medium text-green-700 hover:underline"
            >
              Log your first round →
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-3 rounded-lg bg-green-50 px-3 py-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-green-700">
                    Handicap index
                  </div>
                  <div className="text-xs text-gray-500">
                    {stats.handicap_index == null
                      ? `Need ${Math.max(0, 3 - stats.handicap_rounds_used)} more eligible round${stats.handicap_rounds_used === 2 ? "" : "s"}`
                      : `Avg lowest ${stats.handicap_best_n} of ${stats.handicap_rounds_used} round${stats.handicap_rounds_used === 1 ? "" : "s"}${stats.handicap_adjustment < 0 ? ` − ${Math.abs(stats.handicap_adjustment).toFixed(1)}` : ""}`}
                  </div>
                  {stats.handicap_rounds_skipped > 0 && (
                    <div className="mt-1 text-xs text-orange-600">
                      {stats.handicap_rounds_skipped} round
                      {stats.handicap_rounds_skipped === 1 ? "" : "s"} skipped — missing rating
                    </div>
                  )}
                </div>
                <div className="text-2xl font-bold text-green-700">
                  {stats.handicap_index ?? "—"}
                </div>
              </div>
              {(stats.handicap_rounds?.length ?? 0) > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowHcDetails((v) => !v)}
                    className="mt-2 text-xs font-medium text-green-700"
                  >
                    {showHcDetails ? "Hide details" : "Show per-round details"}
                  </button>
                  {showHcDetails && (
                    <div className="mt-2 space-y-1 border-t border-green-200 pt-2">
                      {stats.handicap_rounds!.map((r) => (
                        <div
                          key={r.round_id}
                          className="flex items-center justify-between text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="text-gray-800">{r.course_name}</span>
                            <span className="ml-1 text-gray-500">
                              {r.hole_count === 9
                                ? `· 9 (${r.nine_played ?? "front"})`
                                : ""}
                            </span>
                            <span className="ml-1 text-gray-500">
                              · {r.gross_score}
                            </span>
                          </div>
                          <div className="ml-2 shrink-0 tabular-nums">
                            {r.differential == null ? (
                              <span className="text-orange-600">
                                skipped (
                                {r.skip_reason === "missing_18_rating"
                                  ? "no 18-hole rating"
                                  : "no 9-hole rating"}
                                )
                              </span>
                            ) : (
                              <span
                                className={
                                  r.used_in_index
                                    ? "font-bold text-green-700"
                                    : "text-gray-500"
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
                      <div className="pt-1 text-[10px] text-gray-500">
                        ★ = used in best-{stats.handicap_best_n} average ·{" "}
                        * = estimated from 18-hole rating
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-center mb-2">
              <Stat label="total rounds" value={stats.rounds_played} />
              <Stat label="wins" value={stats.total_wins} />
            </div>
            {stats.rounds_played_18 > 0 && (
              <div className="mt-2 border-t border-gray-100 pt-2">
                <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                  18 holes
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="rounds" value={stats.rounds_played_18} />
                  <Stat label="avg" value={stats.avg_score_18 ?? "—"} />
                  <Stat label="best" value={stats.best_score_18 ?? "—"} />
                </div>
              </div>
            )}
            {stats.rounds_played_9 > 0 && (
              <div className="mt-2 border-t border-gray-100 pt-2">
                <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                  9 holes
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="rounds" value={stats.rounds_played_9} />
                  <Stat label="avg" value={stats.avg_score_9 ?? "—"} />
                  <Stat label="best" value={stats.best_score_9 ?? "—"} />
                </div>
              </div>
            )}
            {stats.by_course.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-gray-500 mb-1.5">Best courses</div>
                <div className="space-y-1.5">
                  {stats.by_course.slice(0, 3).map((c) => (
                    <Link
                      key={c.course_id}
                      href={`/courses/${c.course_id}`}
                      className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2 hover:bg-green-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-800 truncate">
                          {c.course_name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {c.rounds_played} rounds · best {c.best_score}
                        </div>
                      </div>
                      <div className="text-base font-bold text-green-700 ml-2">
                        {c.avg_score}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card mb-4">
        <button
          type="button"
          onClick={() => setShowPwd((v) => !v)}
          className="w-full flex justify-between items-center text-sm font-semibold text-gray-800"
        >
          <span>Change password</span>
          <span className="text-gray-400">{showPwd ? "−" : "+"}</span>
        </button>
        {showPwd && (
          <form onSubmit={changePassword} className="mt-3 space-y-3">
            {pwdError && (
              <div className="bg-red-50 text-red-600 text-sm p-2.5 rounded-lg">
                {pwdError}
              </div>
            )}
            {pwdSuccess && (
              <div className="bg-green-50 text-green-700 text-sm p-2.5 rounded-lg">
                Password updated.
              </div>
            )}
            <input
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              placeholder="Current password"
              autoComplete="current-password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
              required
            />
            <input
              type="password"
              value={nextPwd}
              onChange={(e) => setNextPwd(e.target.value)}
              placeholder="New password"
              autoComplete="new-password"
              minLength={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
              required
            />
            <input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              minLength={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
              required
            />
            <button
              type="submit"
              disabled={pwdSubmitting}
              className="w-full py-2 bg-green-700 text-white font-medium rounded-lg hover:bg-green-800 disabled:opacity-50 transition"
            >
              {pwdSubmitting ? "Saving..." : "Update password"}
            </button>
          </form>
        )}
      </div>

      {user.is_admin && (
        <Link
          href="/admin"
          className="block mb-4 px-3 py-2.5 bg-white border border-gray-200 text-center text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50"
        >
          Admin tools →
        </Link>
      )}

      <div className="card mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-800">App appearance</div>
          <div className="text-xs text-gray-500">Currently using the classic UI</div>
        </div>
        <UiModeToggle currentMode="classic" />
      </div>

      <button
        onClick={signOut}
        className="w-full py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition"
      >
        Sign Out
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-xl font-bold text-green-700">{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
