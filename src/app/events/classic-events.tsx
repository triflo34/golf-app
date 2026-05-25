"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
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
  draft: "bg-gray-100 text-gray-700",
  open: "bg-blue-100 text-blue-800",
  in_progress: "bg-green-100 text-green-800",
  completed: "bg-purple-100 text-purple-800",
  archived: "bg-gray-200 text-gray-500",
};

function formatDateRange(start: string, end: string): string {
  if (start === end) return start;
  return `${start} → ${end}`;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ClassicEvents() {
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-green-700 text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-green-800">Events</h1>
        <Link
          href="/events/new"
          className="px-3 py-1.5 rounded-md bg-green-700 text-white text-sm font-medium"
        >
          New event
        </Link>
      </div>

      {events === null ? (
        <div className="text-gray-500 text-sm">Loading…</div>
      ) : events.length === 0 ? (
        <div className="text-gray-500 text-sm">
          No events yet. Create one to get started.
        </div>
      ) : (
        <ul className="space-y-3">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                href={`/events/${e.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:border-green-400"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-gray-900">{e.name}</div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[e.status]}`}
                  >
                    {e.status.replace("_", " ")}
                  </span>
                </div>
                <div className="mt-1 text-sm text-gray-600">{e.course_name}</div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {formatDateRange(e.start_date, e.end_date)}
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-gray-600">
                  <span>{e.participant_count} players</span>
                  <span>·</span>
                  <span>Entry {formatMoney(e.entry_fee_cents)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
