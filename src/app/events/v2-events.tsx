"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { V2PageShell } from "@/components/v2/page-shell";
import { V2Card } from "@/components/v2/card";
import { V2LivePill } from "@/components/v2/live-pill";
import type { EventStatus } from "@/lib/types";
import type { EventStandings, LeaderboardEntry } from "@/lib/standings";

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

function vsParLabel(n: number): string {
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : String(n);
}

function vsParTone(vsPar: number, through: number): string {
  if (through === 0) return "text-[var(--v2-text-dim)]";
  if (vsPar < 0) return "text-[var(--v2-sage)]";
  if (vsPar > 0) return "text-red-300";
  return "text-[var(--v2-text-dim)]";
}

const serif = { fontFamily: "var(--font-fraunces), Georgia, serif" };
const sans = { fontFamily: "var(--font-outfit), system-ui, sans-serif" };

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

  const liveEvents = events?.filter((e) => e.status === "in_progress") ?? [];
  const restEvents = events?.filter((e) => e.status !== "in_progress") ?? [];

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
        <>
          {/* Happening now — live events pinned to the top with a polling
              leaderboard peek, deep-linking into the event's live view. */}
          {liveEvents.length > 0 && (
            <section className="mb-5 v2-reveal">
              <SectionLabel>Happening now</SectionLabel>
              <div className="space-y-2.5">
                {liveEvents.map((e) => (
                  <EventLiveHero key={e.id} event={e} />
                ))}
              </div>
            </section>
          )}

          {restEvents.length > 0 && (
            <>
              {liveEvents.length > 0 && <SectionLabel>All events</SectionLabel>}
              <ul className="space-y-2.5">
                {restEvents.map((e) => (
                  <li key={e.id}>
                    <Link href={`/events/${e.id}`} className="block">
                      <V2Card className="!p-3.5" interactive>
                        <div className="flex items-start justify-between gap-2">
                          <div
                            className="min-w-0 flex-1 truncate text-[15px] font-medium text-[var(--v2-text)]"
                            style={serif}
                          >
                            {e.name}
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_CHIP[e.status]}`}
                          >
                            {e.status.replace("_", " ")}
                          </span>
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
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </V2PageShell>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-text-dim)]"
      style={{ letterSpacing: "0.08em" }}
    >
      {children}
    </h2>
  );
}

/**
 * Live event hero — mirrors the home-screen LiveHero (spec §7.1) but for an
 * in-progress event. Self-fetches standings on a 30s visibility-aware poll so
 * the current leader and progress stay fresh, and deep-links into the event
 * (which opens on the live "Play" tab).
 */
function EventLiveHero({ event }: { event: EventListItem }) {
  const [standings, setStandings] = useState<EventStandings | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/${event.id}/standings`, { cache: "no-store" });
    if (!res.ok) return;
    setStandings(await res.json());
  }, [event.id]);

  // 30s poll, paused while the tab is hidden (matches the detail page).
  useEffect(() => {
    load();
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      stop();
      timer = setInterval(load, 30_000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        load();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  const leader: LeaderboardEntry | null =
    standings && standings.leaderboard.length > 0 && standings.leaderboard[0].through > 0
      ? standings.leaderboard[0]
      : null;
  const started = standings?.leaderboard.some((r) => r.through > 0) ?? false;
  const scoring = standings?.leaderboard.filter((r) => r.through > 0).length ?? 0;

  return (
    <Link href={`/events/${event.id}`} className="block">
      <V2Card variant="live" className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div
              className="text-[10px] font-semibold uppercase text-[var(--v2-gold)]"
              style={{ ...sans, letterSpacing: "0.1em" }}
            >
              Live now ·{" "}
              {started
                ? `${scoring}/${event.participant_count} scoring`
                : `${event.participant_count} player${event.participant_count === 1 ? "" : "s"}`}
            </div>
            <h3
              className="mt-1 truncate text-[19px] leading-tight text-[var(--v2-text)]"
              style={serif}
            >
              {event.name}
            </h3>
            <div className="mt-1 truncate text-[11px] text-[var(--v2-text-dim)]" style={sans}>
              {event.course_name}
            </div>
          </div>
          <V2LivePill />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--v2-gold)]/15 pt-3">
          {leader ? (
            <div className="flex min-w-0 items-center gap-2">
              <span style={{ fontSize: "14px" }}>👑</span>
              <span className="truncate text-[12px] font-medium text-[var(--v2-text)]" style={sans}>
                {leader.display_name}
              </span>
              <span
                className={`shrink-0 text-[12px] font-semibold ${vsParTone(leader.vs_par, leader.through)}`}
              >
                {vsParLabel(leader.vs_par)}
              </span>
              <span className="shrink-0 text-[11px] text-[var(--v2-text-dim)]">
                thru {leader.through}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[var(--v2-gold)]">
              <span style={{ fontSize: "14px" }}>♛</span>
              <span className="text-[12px] font-medium" style={sans}>
                {standings ? "Waiting for first scores" : "Open event"}
              </span>
            </div>
          )}
          <span className="shrink-0 text-[var(--v2-gold)]" style={{ ...serif, fontSize: "18px" }}>
            →
          </span>
        </div>
      </V2Card>
    </Link>
  );
}
