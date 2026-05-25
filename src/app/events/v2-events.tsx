"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { V2PageShell } from "@/components/v2/page-shell";
import { V2Card } from "@/components/v2/card";
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

const STATUS_STYLES: Record<EventStatus, string> = {
  draft: "bg-[var(--v2-surface-2)] text-[var(--v2-muted)]",
  open: "bg-blue-500/20 text-blue-300",
  in_progress: "bg-[var(--v2-score)]/25 text-[var(--v2-score-soft)]",
  completed: "bg-purple-500/25 text-purple-300",
  archived: "bg-[var(--v2-surface-2)] text-[var(--v2-muted)]",
};

function formatDateRange(start: string, end: string): string {
  if (start === end) return start;
  return `${start} → ${end}`;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

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
          <div className="animate-pulse text-[var(--v2-accent)]">Loading…</div>
        </div>
      </V2PageShell>
    );
  }

  return (
    <V2PageShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Events</h1>
        <Link
          href="/events/new"
          className="rounded-full border border-[var(--v2-score)] px-3 py-1.5 text-sm font-semibold text-[var(--v2-score)] hover:bg-[var(--v2-score)] hover:text-black"
        >
          + New event
        </Link>
      </div>

      {events === null ? (
        <V2Card>
          <div className="py-6 text-center text-[var(--v2-muted)]">Loading…</div>
        </V2Card>
      ) : events.length === 0 ? (
        <V2Card>
          <div className="py-6 text-center text-sm text-[var(--v2-muted)]">
            No events yet. Create one to get started.
          </div>
        </V2Card>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/events/${e.id}`} className="block">
                <V2Card className="!p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-white">{e.name}</div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[e.status]}`}
                    >
                      {e.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-[var(--v2-muted)]">
                    {e.course_name}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--v2-muted)]">
                    {formatDateRange(e.start_date, e.end_date)}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-[var(--v2-muted)]">
                    <span>{e.participant_count} players</span>
                    <span>·</span>
                    <span>Entry {formatMoney(e.entry_fee_cents)}</span>
                  </div>
                </V2Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </V2PageShell>
  );
}
