"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { V2PageShell } from "@/components/v2/page-shell";
import { V2Card } from "@/components/v2/card";
import { V2LivePill } from "@/components/v2/live-pill";
import type { EventStatus } from "@/lib/types";

type EventListItem = {
  id: number;
  name: string;
  course_id: number;
  course_name: string;
  start_date: string;
  end_date: string;
  entry_fee_cents: number;
  description: string | null;
  status: EventStatus;
  exclude_from_leaderboard: boolean;
  created_by: string;
  created_at: string;
  participant_count: number;
};

const STATUS_CHIP: Record<EventStatus, string> = {
  draft: "bg-[var(--v2-surface-2)] text-[var(--v2-text-dim)]",
  open: "bg-[var(--v2-sage)]/18 text-[var(--v2-sage)]",
  in_progress: "bg-[var(--v2-gold)]/20 text-[var(--v2-gold)]",
  completed: "bg-[var(--v2-purple)]/22 text-[var(--v2-purple)]",
  archived: "bg-[var(--v2-surface-2)] text-[var(--v2-text-faint)]",
};

function formatDateRange(start: string, end: string): string {
  if (start === end) return start;
  return `${start} → ${end}`;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const serif = { fontFamily: "var(--font-fraunces), Georgia, serif" };

export function V2Events() {
  const { user, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<EventListItem[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/events", { cache: "no-store" });
    if (!res.ok) {
      setEvents([]);
      return;
    }
    const data = await res.json();
    setEvents(data.events ?? []);
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (authLoading || !user) {
    return (
      <V2PageShell>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="animate-pulse text-[var(--v2-gold)]">Loading…</div>
        </div>
      </V2PageShell>
    );
  }

  return (
    <V2PageShell>
      {/* Header */}
      <header className="mb-4 flex items-center justify-between gap-2 py-1">
        <div className="w-9" />
        <h1
          className="flex-1 text-center text-[20px] font-medium text-[var(--v2-gold)]"
          style={serif}
        >
          Events
        </h1>
        <Link
          href="/events/new"
          aria-label="New event"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--v2-gold)]/40 text-[var(--v2-gold)] hover:bg-[var(--v2-gold)]/10"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Link>
      </header>

      {events === null ? (
        <V2Card>
          <div className="py-6 text-center text-[var(--v2-text-dim)]">Loading…</div>
        </V2Card>
      ) : events.length === 0 ? (
        <V2Card>
          <div className="py-8 text-center text-sm text-[var(--v2-text-dim)]">
            No events yet.{" "}
            <Link href="/events/new" className="font-medium text-[var(--v2-gold)] hover:underline">
              Create one →
            </Link>
          </div>
        </V2Card>
      ) : (
        <ul className="space-y-2.5">
          {events.map((e) => {
            const live = e.status === "in_progress";
            return (
              <li key={e.id}>
                <Link href={`/events/${e.id}`} className="block">
                  <V2Card className="!p-3.5" variant={live ? "live" : "default"} interactive>
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className="min-w-0 flex-1 truncate text-[15px] font-medium text-[var(--v2-text)]"
                        style={serif}
                      >
                        {e.name}
                      </div>
                      {live ? (
                        <V2LivePill />
                      ) : (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_CHIP[e.status]}`}
                        >
                          {e.status.replace("_", " ")}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-[var(--v2-text-dim)]">{e.course_name}</div>
                    <div className="mt-0.5 text-xs text-[var(--v2-text-faint)]">
                      {formatDateRange(e.start_date, e.end_date)}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-[var(--v2-text-dim)]">
                      <span>{e.participant_count} players</span>
                      <span className="text-[var(--v2-text-faint)]">·</span>
                      <span>Entry {formatMoney(e.entry_fee_cents)}</span>
                    </div>
                  </V2Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </V2PageShell>
  );
}
