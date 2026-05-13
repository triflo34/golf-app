"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import type { AdminGuestSummary } from "@/app/api/admin/guests/route";

type UserAccount = {
  id: string;
  username: string;
  display_name: string;
  hidden: boolean;
};

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [guests, setGuests] = useState<AdminGuestSummary[] | null>(null);
  const [users, setUsers] = useState<UserAccount[] | null>(null);
  const [active, setActive] = useState<AdminGuestSummary | null>(null);
  const [mergeSource, setMergeSource] = useState<AdminGuestSummary | null>(null);
  const [resetUser, setResetUser] = useState<UserAccount | null>(null);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/admin/guests", { cache: "no-store" });
    if (res.status === 403) {
      router.replace("/");
      return;
    }
    const data = await res.json();
    setGuests(data.guests ?? []);

    const usersRes = await fetch("/api/admin/users", { cache: "no-store" });
    if (usersRes.ok) {
      const usersData = await usersRes.json();
      setUsers(usersData.users ?? []);
    } else {
      setUsers([]);
    }
  }, [router]);

  async function backfillWeather() {
    setBackfilling(true);
    setBackfillMsg(null);
    try {
      let totalProcessed = 0;
      let totalSucceeded = 0;
      let totalFailed = 0;
      for (;;) {
        const res = await fetch("/api/admin/backfill-weather?limit=25", {
          method: "POST",
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setBackfillMsg(`Failed: ${d.error ?? res.status}`);
          break;
        }
        const data = (await res.json()) as {
          processed: number;
          succeeded: number;
          failed: number;
          remaining: number;
        };
        totalProcessed += data.processed;
        totalSucceeded += data.succeeded;
        totalFailed += data.failed;
        setBackfillMsg(
          `${totalSucceeded} succeeded · ${totalFailed} failed · ${data.remaining} remaining…`,
        );
        if (data.processed === 0 || data.remaining === 0) {
          setBackfillMsg(
            `Done — ${totalSucceeded} succeeded, ${totalFailed} failed (${totalProcessed} rounds processed).`,
          );
          break;
        }
      }
    } finally {
      setBackfilling(false);
    }
  }

  async function toggleHidden(userId: string, hidden: boolean) {
    setTogglingUserId(userId);
    const res = await fetch("/api/admin/toggle-user-hidden", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, hidden }),
    });
    setTogglingUserId(null);
    if (res.ok) {
      reload();
    }
  }

  useEffect(() => {
    if (!loading && user) reload();
  }, [loading, user, reload]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-green-700 text-lg">Loading...</div>
      </div>
    );
  }
  if (!user) return null;
  if (!user.is_admin) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href="/" className="text-sm text-green-700 font-medium">
          ← Home
        </Link>
        <div className="card mt-4 text-center py-10 text-gray-400">
          Admin only.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <Link href="/profile" className="text-sm text-green-700 font-medium">
        ← Profile
      </Link>
      <h1 className="text-2xl font-bold text-green-800 my-4">Admin</h1>

      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-2 text-sm">
          Guest players ({guests?.length ?? "…"})
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          Promote a guest to a real account — all their existing scores stay attached.
        </p>
        {guests === null ? (
          <div className="text-center py-6 text-gray-400 text-sm">Loading...</div>
        ) : guests.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">
            No guest players yet.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {guests.map((g) => (
              <li
                key={g.name}
                className="flex items-center justify-between py-2"
              >
                <div>
                  <div className="font-semibold text-gray-800 text-sm">
                    {g.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {g.rounds_played} rounds · {g.scores} scores
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMergeSource(g)}
                    className="text-sm font-medium text-gray-700 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200"
                  >
                    Merge
                  </button>
                  <button
                    onClick={() => setActive(g)}
                    className="text-sm font-medium text-green-700 px-3 py-1.5 rounded-lg bg-green-50 hover:bg-green-100"
                  >
                    Promote
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {active && (
        <PromoteModal
          guest={active}
          onClose={() => setActive(null)}
          onDone={() => {
            setActive(null);
            reload();
          }}
        />
      )}

      {mergeSource && guests && (
        <MergeModal
          source={mergeSource}
          allGuests={guests}
          onClose={() => setMergeSource(null)}
          onDone={() => {
            setMergeSource(null);
            reload();
          }}
        />
      )}

      <div className="card mt-6">
        <h2 className="font-semibold text-gray-800 mb-2 text-sm">
          Player accounts ({users?.length ?? "…"})
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          Reset a player's password or hide accounts from the player picker.
        </p>
        {users === null ? (
          <div className="text-center py-6 text-gray-400 text-sm">Loading...</div>
        ) : users.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">
            <p>No player accounts yet.</p>
            <p className="mt-2 text-xs">
              Promote a guest or register a user first; only real accounts can be hidden from the player picker.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {users.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between py-2"
              >
                <div>
                  <div className="font-semibold text-gray-800 text-sm">
                    {u.display_name}
                    {u.hidden && (
                      <span className="ml-2 text-[10px] font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded">
                        hidden
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    @{u.username}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setResetUser(u)}
                    className="text-sm font-medium text-blue-700 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100"
                  >
                    Reset password
                  </button>
                  <button
                    onClick={() => toggleHidden(u.id, !u.hidden)}
                    disabled={togglingUserId === u.id}
                    className="text-sm font-medium text-gray-700 px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
                  >
                    {u.hidden ? "Unhide" : "Hide"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onDone={() => setResetUser(null)}
        />
      )}

      <div className="card mt-6">
        <h2 className="font-semibold text-gray-800 mb-2 text-sm">Maintenance</h2>
        <p className="text-xs text-gray-500 mb-3">
          Fill in weather data for existing rounds that don&apos;t have it yet.
          Runs in batches of 25, ~1.1s per round (Nominatim rate limit).
        </p>
        <button
          onClick={backfillWeather}
          disabled={backfilling}
          className="text-sm font-medium text-green-700 px-3 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 disabled:opacity-50"
        >
          {backfilling ? "Backfilling…" : "Backfill weather"}
        </button>
        {backfillMsg && (
          <div className="mt-2 text-xs text-gray-600">{backfillMsg}</div>
        )}
      </div>
    </div>
  );
}

function MergeModal({
  source,
  allGuests,
  onClose,
  onDone,
}: {
  source: AdminGuestSummary;
  allGuests: AdminGuestSummary[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<
    { round_id: number; played_at: string; course_name: string }[] | null
  >(null);
  const [submitting, setSubmitting] = useState(false);

  const candidates = allGuests.filter(
    (g) => g.name.toLowerCase() !== source.name.toLowerCase(),
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setConflicts(null);
    if (!target) {
      setError("Pick a guest to merge into");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/admin/merge-guests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: source.name, target }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed");
      if (Array.isArray(data.conflicts)) setConflicts(data.conflicts);
      setSubmitting(false);
      return;
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm my-4">
        <h3 className="text-lg font-bold text-gray-800">
          Merge &quot;{source.name}&quot; into…
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          All {source.scores} scores under &quot;{source.name}&quot; will be re-tagged with the target guest&apos;s name.
        </p>

        {error && (
          <div className="mb-3 bg-red-50 text-red-600 text-sm p-2.5 rounded-lg">
            {error}
          </div>
        )}

        {conflicts && conflicts.length > 0 && (
          <div className="mb-3 bg-amber-50 text-amber-700 text-xs p-2.5 rounded-lg">
            <div className="font-semibold mb-1">Rounds with both guests:</div>
            <ul className="list-disc list-inside space-y-0.5">
              {conflicts.map((c) => (
                <li key={c.round_id}>
                  {c.course_name} — {c.played_at}
                </li>
              ))}
            </ul>
            <div className="mt-2">
              Fix each by removing one of the duplicate scores in the round before merging.
            </div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Target guest</label>
            {candidates.length === 0 ? (
              <div className="text-sm text-gray-400">
                No other guests to merge into.
              </div>
            ) : (
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                required
              >
                <option value="">Pick a guest…</option>
                {candidates.map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name} ({g.scores} scores)
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-2 bg-white text-gray-600 border border-gray-200 font-medium rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || candidates.length === 0}
              className="flex-1 py-2 bg-green-700 text-white font-medium rounded-lg disabled:opacity-50"
            >
              {submitting ? "..." : "Merge"}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}

function PromoteModal({
  guest,
  onClose,
  onDone,
}: {
  guest: AdminGuestSummary;
  onClose: () => void;
  onDone: () => void;
}) {
  const [username, setUsername] = useState(
    guest.name.toLowerCase().replace(/[^a-z0-9_]/g, ""),
  );
  const [displayName, setDisplayName] = useState(guest.name);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const res = await fetch("/api/admin/promote-guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guest_name: guest.name,
        username,
        display_name: displayName,
        password,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed");
      setSubmitting(false);
      return;
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm my-4">
        <h3 className="text-lg font-bold text-gray-800">
          Promote &quot;{guest.name}&quot;
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Creates a real account. All {guest.scores} existing scores will be
          re-linked to this user.
        </p>

        {error && (
          <div className="mb-3 bg-red-50 text-red-600 text-sm p-2.5 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Display name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Initial password
            </label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={4}
              placeholder="share with the player"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
              required
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-2 bg-white text-gray-600 border border-gray-200 font-medium rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2 bg-green-700 text-white font-medium rounded-lg disabled:opacity-50"
            >
              {submitting ? "..." : "Promote"}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordModal({
  user,
  onClose,
  onDone,
}: {
  user: UserAccount;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setSubmitting(true);
    const res = await fetch("/api/admin/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: user.username,
        password,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed");
      setSubmitting(false);
      return;
    }
    setSuccess(true);
    setPassword("");
    setTimeout(() => {
      onDone();
    }, 1500);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm my-4">
        <h3 className="text-lg font-bold text-gray-800">
          Reset password for {user.display_name}
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Set a new password for @{user.username}
        </p>

        {error && (
          <div className="mb-3 bg-red-50 text-red-600 text-sm p-2.5 rounded-lg">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-3 bg-green-50 text-green-600 text-sm p-2.5 rounded-lg">
            Password reset successfully!
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              New password
            </label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={4}
              placeholder="share with the player"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
              required
              disabled={submitting}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-2 bg-white text-gray-600 border border-gray-200 font-medium rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2 bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50"
            >
              {submitting ? "..." : "Reset"}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
