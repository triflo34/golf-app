"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import type { InvitePreview } from "@/app/api/invite/[token]/route";

type Variant = "classic" | "v2";

function Shell({ v2, children }: { v2: boolean; children: React.ReactNode }) {
  return v2 ? (
    <div className="v2-bg flex min-h-screen flex-col items-center justify-center px-4 text-[var(--v2-text)]">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  ) : (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-gray-900">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

export function JoinEvent({ token, variant }: { token: string; variant: Variant }) {
  const v2 = variant === "v2";
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<InvitePreview | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetch(`/api/invite/${token}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: InvitePreview | null) => {
        setData(d);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [user, token]);

  async function join() {
    setJoining(true);
    setError(null);
    try {
      const res = await fetch(`/api/invite/${token}/join`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to join");
      router.push(`/events/${body.event_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join");
      setJoining(false);
    }
  }

  // ---- styling helpers ----
  const card = v2 ? "v2-card" : "card border border-gray-200";
  const muted = v2 ? "text-[var(--v2-text-dim)]" : "text-gray-500";
  const gold = v2 ? "text-[var(--v2-gold)]" : "text-green-700";
  const serif = v2 ? { fontFamily: "var(--font-fraunces), Georgia, serif" } : undefined;
  const primaryBtn = v2
    ? "w-full rounded-lg bg-[var(--v2-gold)] py-3 text-sm font-bold text-[var(--v2-green-deep)] disabled:opacity-50"
    : "w-full rounded-lg bg-green-700 py-3 text-sm font-bold text-white disabled:opacity-50";
  const ghostBtn = v2
    ? "block w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface)] py-2.5 text-center text-sm font-medium text-[var(--v2-text)]"
    : "block w-full rounded-lg border border-gray-300 bg-white py-2.5 text-center text-sm font-medium text-gray-700";

  if (authLoading) {
    return (
      <Shell v2={v2}>
        <div className={`animate-pulse text-center ${gold}`}>Loading…</div>
      </Shell>
    );
  }

  // Not logged in — preserve the deep link through auth.
  if (!user) {
    const next = encodeURIComponent(`/join/${token}`);
    return (
      <Shell v2={v2}>
        <div className={card}>
          <h1 className={`text-center text-xl font-bold ${gold}`} style={serif}>
            You&rsquo;re invited
          </h1>
          <p className={`mt-2 text-center text-sm ${muted}`}>
            Log in or create an account to join this golf event.
          </p>
          <div className="mt-4 space-y-2">
            <Link href={`/login?next=${next}`} className={primaryBtn + " block text-center"}>
              Log in
            </Link>
            <Link href={`/register?next=${next}`} className={ghostBtn}>
              Create account
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  if (!loaded) {
    return (
      <Shell v2={v2}>
        <div className={`animate-pulse text-center ${gold}`}>Loading invite…</div>
      </Shell>
    );
  }

  if (!data || !data.valid) {
    const reason = data && !data.valid ? data.reason : "not_found";
    const msg =
      reason === "revoked"
        ? "This invite link has been revoked by the organizer."
        : reason === "expired"
          ? "This invite link has expired. Ask the organizer for a new one."
          : "This invite link isn’t valid.";
    return (
      <Shell v2={v2}>
        <div className={card}>
          <div className={`text-center text-sm ${muted}`}>{msg}</div>
          <Link href="/" className={`mt-4 ${ghostBtn}`}>
            Go home
          </Link>
        </div>
      </Shell>
    );
  }

  const e = data.event;
  return (
    <Shell v2={v2}>
      <div className={card}>
        <div className={`text-center text-[11px] font-semibold uppercase tracking-wide ${gold}`}>
          Event invite
        </div>
        <h1 className={`mt-1 text-center text-2xl font-bold ${v2 ? "text-[var(--v2-text)]" : "text-gray-900"}`} style={serif}>
          {e.name}
        </h1>
        <div className={`mt-1 text-center text-sm ${muted}`}>{e.course_name}</div>
        <div className={`text-center text-xs ${muted}`}>
          {e.start_date === e.end_date ? e.start_date : `${e.start_date} → ${e.end_date}`} ·{" "}
          {e.player_count} player{e.player_count === 1 ? "" : "s"}
        </div>

        {error && (
          <div
            className={
              v2
                ? "mt-3 rounded-lg border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-300"
                : "mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            }
          >
            {error}
          </div>
        )}

        <div className="mt-4">
          {data.already_joined ? (
            <Link href={`/events/${e.id}`} className={primaryBtn + " block text-center"}>
              You&rsquo;re in — go to event →
            </Link>
          ) : !data.joinable ? (
            <>
              <div className={`mb-3 text-center text-sm ${muted}`}>
                {data.full ? "This event is full." : "This event isn’t accepting new players right now."}
              </div>
              <Link href={`/events/${e.id}`} className={ghostBtn}>
                View event
              </Link>
            </>
          ) : (
            <button type="button" onClick={join} disabled={joining} className={primaryBtn}>
              {joining ? "Joining…" : "Join event"}
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}
