"use client";

import { useCallback, useEffect, useState } from "react";
import { CopyLinkButton } from "@/components/copy-link-button";
import { InviteQR } from "@/components/invite-qr";
import type { InviteState } from "@/app/api/events/[id]/invite/route";

type Variant = "classic" | "v2";

/**
 * Organizer invite tool — generates a QR + shareable link that lets anyone
 * with the link join the event in one tap. Rotate (new link) or revoke.
 */
export function InvitePanel({ eventId, variant }: { eventId: number; variant: Variant }) {
  const v2 = variant === "v2";
  const [state, setState] = useState<InviteState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/${eventId}/invite`, { cache: "no-store" });
    if (res.ok) setState(await res.json());
    else setState({ token: null, expires_at: null, revoked: false });
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/invite`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setState({ token: body.token, expires_at: body.expires_at, revoked: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!confirm("Revoke this invite link? Anyone holding it won't be able to join.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/invite`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setState({ token: null, expires_at: null, revoked: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const token = state?.token ?? null;
  const path = token ? `/join/${token}` : null;
  const url =
    token && typeof window !== "undefined" ? `${window.location.origin}${path}` : null;

  const card = v2 ? "v2-card" : "card border border-gray-200";
  const muted = v2 ? "text-[var(--v2-text-dim)]" : "text-gray-500";
  const heading = v2 ? "text-[var(--v2-text)]" : "text-gray-800";
  const goldBtn = v2
    ? "rounded-lg bg-[var(--v2-gold)] px-3 py-2 text-sm font-semibold text-[var(--v2-green-deep)] disabled:opacity-50"
    : "rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
  const ghostBtn = v2
    ? "rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-2 text-sm font-medium text-[var(--v2-text)] disabled:opacity-50"
    : "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-50";

  return (
    <section className={card}>
      <div className={`mb-1 text-sm font-semibold ${heading}`}>Invite players</div>
      <p className={`mb-3 text-xs ${muted}`}>
        Share a link or QR code — anyone in the group can scan it and join this event in one tap.
      </p>

      {error && (
        <div
          className={
            v2
              ? "mb-2 rounded-lg border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-300"
              : "mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          }
        >
          {error}
        </div>
      )}

      {state === null ? (
        <div className={`py-4 text-center text-sm ${muted}`}>Loading…</div>
      ) : token && url && path ? (
        <div className="flex flex-col items-center gap-3">
          <InviteQR url={url} size={196} />
          <div
            className={
              v2
                ? "w-full truncate rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-center text-xs text-[var(--v2-text-dim)]"
                : "w-full truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs text-gray-600"
            }
          >
            {url}
          </div>
          <div className="flex w-full flex-wrap items-center justify-center gap-2">
            <CopyLinkButton
              path={path}
              label="Copy link"
              className={
                v2
                  ? "inline-flex items-center gap-1.5 rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-2 text-sm font-medium text-[var(--v2-gold)]"
                  : "inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-green-700 hover:border-green-400"
              }
            />
            <button type="button" onClick={generate} disabled={busy} className={ghostBtn}>
              New link
            </button>
            <button
              type="button"
              onClick={revoke}
              disabled={busy}
              className={
                v2
                  ? "rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm font-medium text-red-300 disabled:opacity-50"
                  : "rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
              }
            >
              Revoke
            </button>
          </div>
          {state.expires_at && (
            <div className={`text-[11px] ${muted}`}>
              Expires {new Date(state.expires_at).toLocaleDateString()}
            </div>
          )}
        </div>
      ) : (
        <button type="button" onClick={generate} disabled={busy} className={`w-full ${goldBtn}`}>
          {busy ? "Creating…" : state.revoked ? "Create a new invite link" : "Create invite link"}
        </button>
      )}
    </section>
  );
}
