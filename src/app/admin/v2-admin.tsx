"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { V2PageShell } from "@/components/v2/page-shell";
import { V2Card } from "@/components/v2/card";
import { V2SectionTitle } from "@/components/v2/section-title";
import type { AdminGuestSummary } from "@/app/api/admin/guests/route";

type UserAccount = {
  id: string;
  username: string;
  display_name: string;
  hidden: boolean;
};

const serif = { fontFamily: "var(--font-fraunces), Georgia, serif" };
const v2Input =
  "w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-sm text-[var(--v2-text)] placeholder-[var(--v2-text-dim)]";

export function V2Admin() {
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
        const res = await fetch("/api/admin/backfill-weather?limit=25", { method: "POST" });
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
        setBackfillMsg(`${totalSucceeded} succeeded · ${totalFailed} failed · ${data.remaining} remaining…`);
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
    if (res.ok) reload();
  }

  useEffect(() => {
    if (!loading && user) reload();
  }, [loading, user, reload]);

  if (loading) {
    return (
      <div className="v2-bg flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-[var(--v2-gold)]">Loading…</div>
      </div>
    );
  }
  if (!user) return null;
  if (!user.is_admin) {
    return (
      <V2PageShell>
        <Link href="/" className="text-sm font-medium text-[var(--v2-gold)]">
          ← Home
        </Link>
        <V2Card className="mt-4 py-10 text-center text-[var(--v2-text-dim)]">Admin only.</V2Card>
      </V2PageShell>
    );
  }

  const pill =
    "rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50";

  return (
    <V2PageShell>
      <Link href="/profile" className="text-sm font-medium text-[var(--v2-gold)]">
        ← Profile
      </Link>
      <h1 className="my-4 text-[22px] font-medium text-[var(--v2-gold)]" style={serif}>
        Admin
      </h1>

      {/* Guests */}
      <V2Card>
        <h2 className="mb-2 text-sm font-semibold text-[var(--v2-text)]">
          Guest players ({guests?.length ?? "…"})
        </h2>
        <p className="mb-3 text-xs text-[var(--v2-text-dim)]">
          Promote a guest to a real account — all their existing scores stay attached.
        </p>
        {guests === null ? (
          <div className="py-6 text-center text-sm text-[var(--v2-text-dim)]">Loading…</div>
        ) : guests.length === 0 ? (
          <div className="py-6 text-center text-sm text-[var(--v2-text-dim)]">No guest players yet.</div>
        ) : (
          <ul className="divide-y divide-[var(--v2-border)]">
            {guests.map((g) => (
              <li key={g.name} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--v2-text)]">{g.name}</div>
                  <div className="text-xs text-[var(--v2-text-dim)]">
                    {g.rounds_played} rounds · {g.scores} scores
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => setMergeSource(g)}
                    className={`${pill} border border-[var(--v2-border)] bg-[var(--v2-surface)] text-[var(--v2-text)]`}
                  >
                    Merge
                  </button>
                  <button
                    onClick={() => setActive(g)}
                    className={`${pill} bg-[var(--v2-gold)] text-[var(--v2-green-deep)]`}
                  >
                    Promote
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </V2Card>

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

      {/* Accounts */}
      <V2Card className="mt-4">
        <h2 className="mb-2 text-sm font-semibold text-[var(--v2-text)]">
          Player accounts ({users?.length ?? "…"})
        </h2>
        <p className="mb-3 text-xs text-[var(--v2-text-dim)]">
          Reset a player&rsquo;s password or hide accounts from the player picker.
        </p>
        {users === null ? (
          <div className="py-6 text-center text-sm text-[var(--v2-text-dim)]">Loading…</div>
        ) : users.length === 0 ? (
          <div className="py-6 text-center text-sm text-[var(--v2-text-dim)]">
            <p>No player accounts yet.</p>
            <p className="mt-2 text-xs">
              Promote a guest or register a user first; only real accounts can be hidden from the
              player picker.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--v2-border)]">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--v2-text)]">
                    {u.display_name}
                    {u.hidden && (
                      <span className="ml-2 rounded bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-[var(--v2-red-text)]">
                        hidden
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--v2-text-dim)]">@{u.username}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => setResetUser(u)}
                    className={`${pill} border border-[var(--v2-border)] bg-[var(--v2-surface)] text-[var(--v2-gold)]`}
                  >
                    Reset password
                  </button>
                  <button
                    onClick={() => toggleHidden(u.id, !u.hidden)}
                    disabled={togglingUserId === u.id}
                    className={`${pill} border border-[var(--v2-border)] bg-[var(--v2-surface)] text-[var(--v2-text)]`}
                  >
                    {u.hidden ? "Unhide" : "Hide"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </V2Card>

      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onDone={() => setResetUser(null)}
        />
      )}

      {/* Maintenance */}
      <V2Card className="mt-4">
        <h2 className="mb-2 text-sm font-semibold text-[var(--v2-text)]">Maintenance</h2>
        <p className="mb-3 text-xs text-[var(--v2-text-dim)]">
          Fill in weather data for existing rounds that don&apos;t have it yet. Runs in batches of
          25, ~1.1s per round (Nominatim rate limit).
        </p>
        <button
          onClick={backfillWeather}
          disabled={backfilling}
          className={`${pill} border border-[var(--v2-gold)]/35 bg-[var(--v2-gold)]/10 text-[var(--v2-gold)]`}
        >
          {backfilling ? "Backfilling…" : "Backfill weather"}
        </button>
        {backfillMsg && <div className="mt-2 text-xs text-[var(--v2-text-dim)]">{backfillMsg}</div>}
      </V2Card>
    </V2PageShell>
  );
}

function ModalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="my-4 w-full max-w-sm rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-bg-0)] p-5 shadow-2xl">
          {children}
        </div>
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
    <ModalShell>
      <h3 className="text-lg font-bold text-[var(--v2-text)]" style={serif}>
        Merge &quot;{source.name}&quot; into…
      </h3>
      <p className="mb-3 text-xs text-[var(--v2-text-dim)]">
        All {source.scores} scores under &quot;{source.name}&quot; will be re-tagged with the target
        guest&apos;s name.
      </p>

      {error && (
        <div className="mb-3 rounded-lg border border-[var(--v2-danger-border)] bg-[var(--v2-danger-bg)] p-2.5 text-sm text-[var(--v2-red-text)]">
          {error}
        </div>
      )}

      {conflicts && conflicts.length > 0 && (
        <div className="mb-3 rounded-lg border border-[var(--v2-amber-warn)]/40 bg-[var(--v2-amber-warn)]/10 p-2.5 text-xs text-[var(--v2-amber-warn)]">
          <div className="mb-1 font-semibold">Rounds with both guests:</div>
          <ul className="list-inside list-disc space-y-0.5">
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
          <label className="mb-1 block text-xs text-[var(--v2-text-dim)]">Target guest</label>
          {candidates.length === 0 ? (
            <div className="text-sm text-[var(--v2-text-dim)]">No other guests to merge into.</div>
          ) : (
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className={v2Input}
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
            className="flex-1 rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface)] py-2 font-medium text-[var(--v2-text)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || candidates.length === 0}
            className="flex-1 rounded-lg bg-[var(--v2-gold)] py-2 font-semibold text-[var(--v2-green-deep)] disabled:opacity-50"
          >
            {submitting ? "…" : "Merge"}
          </button>
        </div>
      </form>
    </ModalShell>
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
  const [username, setUsername] = useState(guest.name.toLowerCase().replace(/[^a-z0-9_]/g, ""));
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
      body: JSON.stringify({ guest_name: guest.name, username, display_name: displayName, password }),
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
    <ModalShell>
      <h3 className="text-lg font-bold text-[var(--v2-text)]" style={serif}>
        Promote &quot;{guest.name}&quot;
      </h3>
      <p className="mb-3 text-xs text-[var(--v2-text-dim)]">
        Creates a real account. All {guest.scores} existing scores will be re-linked to this user.
      </p>

      {error && (
        <div className="mb-3 rounded-lg border border-[var(--v2-danger-border)] bg-[var(--v2-danger-bg)] p-2.5 text-sm text-[var(--v2-red-text)]">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-[var(--v2-text-dim)]">Username</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className={v2Input} required />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--v2-text-dim)]">Display name</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={v2Input} required />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--v2-text-dim)]">Initial password</label>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={4}
            placeholder="share with the player"
            className={v2Input}
            required
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface)] py-2 font-medium text-[var(--v2-text)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-lg bg-[var(--v2-gold)] py-2 font-semibold text-[var(--v2-green-deep)] disabled:opacity-50"
          >
            {submitting ? "…" : "Promote"}
          </button>
        </div>
      </form>
    </ModalShell>
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
      body: JSON.stringify({ username: user.username, password }),
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
    <ModalShell>
      <h3 className="text-lg font-bold text-[var(--v2-text)]" style={serif}>
        Reset password for {user.display_name}
      </h3>
      <p className="mb-3 text-xs text-[var(--v2-text-dim)]">Set a new password for @{user.username}</p>

      {error && (
        <div className="mb-3 rounded-lg border border-[var(--v2-danger-border)] bg-[var(--v2-danger-bg)] p-2.5 text-sm text-[var(--v2-red-text)]">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-3 rounded-lg border border-[var(--v2-sage)]/40 bg-[var(--v2-sage)]/12 p-2.5 text-sm text-[var(--v2-sage)]">
          Password reset successfully!
        </div>
      )}

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-[var(--v2-text-dim)]">New password</label>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={4}
            placeholder="share with the player"
            className={v2Input}
            required
            disabled={submitting}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface)] py-2 font-medium text-[var(--v2-text)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-lg bg-[var(--v2-gold)] py-2 font-semibold text-[var(--v2-green-deep)] disabled:opacity-50"
          >
            {submitting ? "…" : "Reset"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
