"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { V2PlayerQuickView } from "@/components/player-quick-view";
import { CopyLinkButton } from "@/components/copy-link-button";
import { InvitePanel } from "@/components/invite-panel";
import { V2LivePill } from "@/components/v2/live-pill";
import { V2SegmentedControl } from "@/components/v2/segmented-control";
import type { EventStatus } from "@/lib/types";
import type {
  Best18Entry,
  EventStandings,
  LeaderboardEntry,
  MostSameEntry,
  PokerStandings,
  ScrambleWinners,
  Settlement,
  SideGameSummary,
  StablefordEntry,
  Worst18Entry,
} from "@/lib/standings";

type EventDetail = {
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
};

type Participant = {
  user_id: string;
  role: "organizer" | "player";
  is_organizer: boolean;
  group_num: number | null;
  display_name: string;
  username: string;
};

type EventRound = {
  id: number;
  round_number: number;
  round_format: "individual" | "scramble";
  hole_count: number;
  played_at: string;
};

type LoadResult = {
  event: EventDetail;
  participants: Participant[];
  rounds: EventRound[];
};

type TabKey = "live" | "leaderboard" | "side" | "payouts" | "rules";

// Spec §7.4 uses short segmented labels: Play / Board / Games / $.
const TAB_OPTIONS: { value: TabKey; label: string }[] = [
  { value: "live", label: "Play" },
  { value: "leaderboard", label: "Board" },
  { value: "side", label: "Games" },
  { value: "payouts", label: "$" },
  { value: "rules", label: "Rules" },
];

const STATUS_CHIP: Record<EventStatus, string> = {
  draft: "bg-[var(--v2-surface-2)] text-[var(--v2-text-dim)]",
  open: "bg-[var(--v2-sage)]/18 text-[var(--v2-sage)]",
  in_progress: "bg-[var(--v2-gold)]/20 text-[var(--v2-gold)]",
  completed: "bg-[var(--v2-purple)]/22 text-[var(--v2-purple)]",
  archived: "bg-[var(--v2-surface-2)] text-[var(--v2-text-faint)]",
};

const serif = { fontFamily: "var(--font-fraunces), Georgia, serif" };

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDateRange(start: string, end: string): string {
  if (start === end) return start;
  return `${start} → ${end}`;
}

function vsParLabel(n: number): string {
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : String(n);
}

function vsParTone(vsPar: number, through: number): string {
  if (through === 0) return "text-[var(--v2-text-dim)]";
  if (vsPar < 0) return "text-[var(--v2-sage)]";
  if (vsPar > 0) return "text-[var(--v2-red-text)]";
  return "text-[var(--v2-text-dim)]";
}

export function V2EventDetail({ id }: { id: string }) {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<LoadResult | null>(null);
  const [standings, setStandings] = useState<EventStandings | null>(null);
  const [standingsError, setStandingsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Player tapped anywhere on the page → open the quick-view card.
  const [quickView, setQuickView] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("live");

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/${id}`, { cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to load event");
      return;
    }
    setError(null);
    setData(await res.json());
  }, [id]);

  const loadStandings = useCallback(async () => {
    const res = await fetch(`/api/events/${id}/standings`, { cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStandingsError(body.error ?? "Failed to load standings");
      return;
    }
    setStandingsError(null);
    setStandings(await res.json());
  }, [id]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Poll standings while the event is live and the tab is visible.
  useEffect(() => {
    if (!user) return;
    const status = data?.event.status;
    const isLive = status === "open" || status === "in_progress";

    loadStandings();
    if (!isLive) return;

    let timer: ReturnType<typeof setInterval> | undefined;
    function start() {
      stop();
      timer = setInterval(loadStandings, 30_000);
    }
    function stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        loadStandings();
        start();
      } else {
        stop();
      }
    }
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user, loadStandings, data?.event.status]);

  if (authLoading || !user) {
    return (
      <div className="v2-bg flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-[var(--v2-gold)]">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="v2-bg min-h-screen px-4 py-6 text-[var(--v2-text)]">
        <Link href="/events" className="text-sm text-[var(--v2-gold)]">
          ← Events
        </Link>
        <div className="mt-4 rounded-lg border border-[var(--v2-danger-border)] bg-[var(--v2-danger-bg)] px-3 py-2 text-sm text-[var(--v2-red-text)]">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="v2-bg flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-[var(--v2-gold)]">Loading event…</div>
      </div>
    );
  }

  const { event, participants, rounds } = data;
  const isOrganizer = participants.some(
    (p) => p.user_id === user.id && p.is_organizer,
  );
  const players = participants;
  const progress = progressLabel(rounds, standings);
  const canScoreNow = event.status === "open" || event.status === "in_progress";
  const scoringRound = canScoreNow ? pickScoringRound(rounds, standings) : null;
  const scoringStarted = scoringRound ? roundMaxThrough(scoringRound, standings) > 0 : false;

  return (
    <div className="v2-bg min-h-screen text-[var(--v2-text)]">
      <div className="mx-auto max-w-lg px-4 py-4 pb-28">
        <Link href="/events" className="text-sm font-medium text-[var(--v2-gold)]">
          ← Events
        </Link>

        {/* Gold-tinted event banner */}
        <div className="v2-card-gold mt-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <h1 className="min-w-0 flex-1 text-[22px] font-medium leading-tight text-[var(--v2-gold)]" style={serif}>
              {event.name}
            </h1>
            {event.status === "in_progress" ? (
              <V2LivePill />
            ) : (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_CHIP[event.status]}`}
              >
                {event.status.replace("_", " ")}
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-[var(--v2-text-dim)]">{event.course_name}</div>
          <div className="text-xs text-[var(--v2-text-faint)]">
            {formatDateRange(event.start_date, event.end_date)}
            {event.status === "in_progress" && progress ? ` · ${progress}` : ""}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--v2-text-dim)]">
            <span>{players.length} players</span>
            <span className="text-[var(--v2-text-faint)]">·</span>
            <span>Entry {formatMoney(event.entry_fee_cents)}</span>
            {event.exclude_from_leaderboard && (
              <>
                <span className="text-[var(--v2-text-faint)]">·</span>
                <span className="text-[var(--v2-amber-warn)]">Off leaderboard</span>
              </>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {isOrganizer && (
              <Link
                href={`/events/${event.id}/manage`}
                className="text-sm font-medium text-[var(--v2-gold)] hover:underline"
              >
                Manage event →
              </Link>
            )}
            <CopyLinkButton
              path={`/events/${event.id}`}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--v2-border)] bg-[var(--v2-surface)] px-2 py-1 text-xs font-medium text-[var(--v2-gold)]"
            />
            {isOrganizer && event.status === "draft" && (
              <span className="text-xs text-[var(--v2-amber-warn)]">
                Add players + side games, then start
              </span>
            )}
          </div>

          {/* Primary scoring CTA — jumps straight into the live round so you
              don't have to dig through tabs / the scorecard to start. */}
          {scoringRound && (
            <Link
              href={`/events/${event.id}/score/${scoringRound.id}`}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--v2-gold)] py-2.5 text-sm font-bold text-[var(--v2-green-deep)]"
              style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
            >
              {scoringStarted
                ? `Resume scoring · R${scoringRound.round_number}`
                : `Start scoring · R${scoringRound.round_number}`}
              <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>

        {/* Tabs */}
        {isOrganizer && (event.status === "draft" || event.status === "open") && (
          <div className="mt-3">
            <InvitePanel eventId={event.id} variant="v2" />
          </div>
        )}

        <div className="mt-4">
          <V2SegmentedControl value={tab} onChange={setTab} options={TAB_OPTIONS} />
        </div>

        <section className="mt-4">
          {/* Board / Games / Payouts all need standings. If that endpoint
              failed, show the reason + a retry instead of hanging forever. */}
          {tab !== "live" && tab !== "rules" && standingsError && !standings ? (
            <StandingsError message={standingsError} onRetry={loadStandings} />
          ) : (
            <>
              {tab === "live" && (
                <LiveTab eventId={event.id} players={players} rounds={rounds} standings={standings} eventStatus={event.status} onPlayer={setQuickView} />
              )}
              {tab === "leaderboard" && <LeaderboardView standings={standings} onPlayer={setQuickView} />}
              {tab === "side" && (
                <SideGamesView
                  eventId={event.id}
                  isOrganizer={isOrganizer}
                  standings={standings}
                  reload={loadStandings}
                  onPlayer={setQuickView}
                />
              )}
              {tab === "payouts" && (
                <PayoutsView
                  entryPotCents={event.entry_fee_cents * players.length}
                  standings={standings}
                  completed={event.status === "completed" || event.status === "archived"}
                />
              )}
              {tab === "rules" && <RulesView description={event.description} />}
            </>
          )}
        </section>
      </div>
      <V2PlayerQuickView playerId={quickView} viewerId={user?.id ?? null} onClose={() => setQuickView(null)} />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-text-dim)]">
      {children}
    </h2>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="v2-card text-sm text-[var(--v2-text-dim)]">{text}</div>
  );
}

function StandingsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="v2-card">
      <div className="text-sm font-medium text-[var(--v2-red-text)]">Couldn&apos;t load standings</div>
      <div className="mt-1 text-xs text-[var(--v2-text-dim)] break-words">{message}</div>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-md border border-[var(--v2-gold)]/40 px-3 py-1.5 text-xs font-medium text-[var(--v2-gold)] hover:bg-[var(--v2-gold)]/10"
      >
        Retry
      </button>
    </div>
  );
}

function PlayersList({
  players,
  onPlayer,
}: {
  players: Participant[];
  onPlayer?: (id: string) => void;
}) {
  return (
    <ul className="v2-card divide-y divide-[var(--v2-border)] !p-0">
      {players.map((p) => (
        <li key={p.user_id} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
          {onPlayer ? (
            <button
              type="button"
              onClick={() => onPlayer(p.user_id)}
              className="text-left text-[var(--v2-text)] underline decoration-dotted decoration-[var(--v2-text-faint)] underline-offset-2"
            >
              {p.display_name}
            </button>
          ) : (
            <span className="text-[var(--v2-text)]">{p.display_name}</span>
          )}
          {p.group_num != null && (
            <span className="text-xs text-[var(--v2-text-dim)]">Group {p.group_num}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function LiveTab({
  eventId,
  players,
  rounds,
  standings,
  eventStatus,
  onPlayer,
}: {
  eventId: number;
  players: Participant[];
  rounds: EventRound[];
  standings: EventStandings | null;
  eventStatus: EventStatus;
  onPlayer?: (id: string) => void;
}) {
  if (players.length === 0) {
    return (
      <EmptyHint text="No players yet. The organizer needs to add players before scoring can begin." />
    );
  }
  if (rounds.length === 0) {
    return (
      <div>
        <SectionLabel>Players ({players.length})</SectionLabel>
        <PlayersList players={players} onPlayer={onPlayer} />
        <p className="mt-3 text-xs text-[var(--v2-text-faint)]">
          Rounds appear once the organizer starts the event.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div>
        <SectionLabel>Rounds</SectionLabel>
        <ul className="space-y-2.5">
          {rounds.map((r) => (
            <RoundCard
              key={r.id}
              eventId={eventId}
              round={r}
              playerCount={players.length}
              standings={standings}
              eventLive={eventStatus === "in_progress"}
              onPlayer={onPlayer}
            />
          ))}
        </ul>
      </div>
      <div>
        <SectionLabel>Players ({players.length})</SectionLabel>
        <PlayersList players={players} onPlayer={onPlayer} />
      </div>
    </div>
  );
}

function RoundCard({
  eventId,
  round,
  playerCount,
  standings,
  eventLive,
  onPlayer,
}: {
  eventId: number;
  round: EventRound;
  playerCount: number;
  standings: EventStandings | null;
  eventLive: boolean;
  onPlayer?: (id: string) => void;
}) {
  type MiniRow = {
    player_id: string;
    display_name: string;
    strokes: number;
    through: number;
    vs_par: number;
  };
  const miniRows: MiniRow[] = [];
  if (standings) {
    for (const p of standings.leaderboard) {
      const pr = p.per_round.find((x) => x.round_id === round.id);
      if (!pr) continue;
      miniRows.push({
        player_id: p.player_id,
        display_name: p.display_name,
        strokes: pr.strokes,
        through: pr.through,
        vs_par: pr.vs_par,
      });
    }
  }
  miniRows.sort((a, b) => {
    if (a.through === 0 && b.through > 0) return 1;
    if (b.through === 0 && a.through > 0) return -1;
    if (a.vs_par !== b.vs_par) return a.vs_par - b.vs_par;
    return a.strokes - b.strokes;
  });
  const top = miniRows.slice(0, 3);
  const anyStarted = miniRows.some((r) => r.through > 0);
  // Only "live" while the event itself is in progress — a completed event's
  // rounds are final, not live, even though they have scores.
  const isLive = anyStarted && eventLive;
  const maxThrough = miniRows.reduce((m, r) => Math.max(m, r.through), 0);
  const playersScored = miniRows.filter((r) => r.through > 0).length;

  return (
    <li className={isLive ? "v2-card-live overflow-hidden !p-0" : "v2-card overflow-hidden !p-0"}>
      <Link href={`/events/${eventId}/score/${round.id}`} className="block p-3.5">
        <div className="flex items-center justify-between">
          <div className="text-[15px] font-semibold text-[var(--v2-text)]" style={serif}>
            Round {round.round_number}
          </div>
          <span className="flex items-center gap-2 text-xs">
            {isLive && <V2LivePill />}
            <span className="capitalize text-[var(--v2-text-dim)]">{round.round_format}</span>
          </span>
        </div>
        <div className="mt-0.5 text-xs text-[var(--v2-text-faint)]">
          {round.played_at} · {round.hole_count} holes
          {anyStarted && (
            <>
              {" "}· thru hole {maxThrough} · {playersScored}/{playerCount}{" "}
              {round.round_format === "scramble" ? "scored" : "players in"}
            </>
          )}
        </div>
        {top.length > 0 && anyStarted && (
          <ul className="mt-2 space-y-1">
            {top.map((row, i) => (
              <li key={row.player_id} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-right text-[var(--v2-text-faint)]">{i + 1}</span>
                <span
                  role={onPlayer ? "button" : undefined}
                  onClick={
                    onPlayer
                      ? (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onPlayer(row.player_id);
                        }
                      : undefined
                  }
                  className={`flex-1 truncate text-[var(--v2-text)] ${onPlayer ? "underline decoration-dotted decoration-[var(--v2-text-faint)] underline-offset-2" : ""}`}
                >
                  {row.display_name}
                </span>
                <span className="text-[var(--v2-text-dim)]">thru {row.through}</span>
                <span className="w-8 text-right font-medium text-[var(--v2-text)]">
                  {row.strokes || "–"}
                </span>
                <span className={`w-10 text-right font-semibold ${vsParTone(row.vs_par, row.through)}`}>
                  {row.through === 0 ? "" : vsParLabel(row.vs_par)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Link>
      <div className="flex items-center justify-between gap-2 border-t border-[var(--v2-border)] px-3.5 py-2.5">
        <Link
          href={`/events/${eventId}/scorecard/${round.id}`}
          className="text-xs font-medium text-[var(--v2-text-dim)] hover:text-[var(--v2-gold)]"
        >
          View scorecard
        </Link>
        <Link
          href={`/events/${eventId}/score/${round.id}`}
          className="inline-flex items-center gap-1 rounded-md bg-[var(--v2-gold)] px-3 py-1.5 text-xs font-bold text-[var(--v2-green-deep)]"
        >
          Score <span aria-hidden="true">→</span>
        </Link>
      </div>
    </li>
  );
}

/** Holes-through the field has reached in a round (max across players). */
function roundMaxThrough(round: EventRound, standings: EventStandings | null): number {
  if (!standings) return 0;
  let m = 0;
  for (const p of standings.leaderboard) {
    const pr = p.per_round.find((x) => x.round_id === round.id);
    if (pr) m = Math.max(m, pr.through);
  }
  return m;
}

/** Has anyone fully finished this round? (every scored player through all holes) */
function roundComplete(round: EventRound, standings: EventStandings | null): boolean {
  if (!standings) return false;
  const entries = standings.leaderboard
    .map((p) => p.per_round.find((x) => x.round_id === round.id))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  return entries.length > 0 && entries.every((e) => e.through >= round.hole_count);
}

/**
 * Which round the "Resume / Start scoring" CTA should jump into: the round
 * that's underway but unfinished, else the first unfinished round, else the
 * first round. Keeps the banner button pointed at the relevant scorecard.
 */
function pickScoringRound(
  rounds: EventRound[],
  standings: EventStandings | null,
): EventRound | null {
  if (rounds.length === 0) return null;
  for (const r of rounds) {
    if (roundMaxThrough(r, standings) > 0 && !roundComplete(r, standings)) return r;
  }
  for (const r of rounds) {
    if (!roundComplete(r, standings)) return r;
  }
  return rounds[0];
}

function progressLabel(
  rounds: EventRound[],
  standings: EventStandings | null,
): string | null {
  if (!standings) return null;
  let liveRound: EventRound | null = null;
  let maxThrough = 0;
  for (const r of rounds) {
    const perRoundEntries = standings.leaderboard
      .map((p) => p.per_round.find((pr) => pr.round_id === r.id))
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    if (perRoundEntries.length === 0) continue;
    const through = perRoundEntries.reduce((m, e) => Math.max(m, e.through), 0);
    if (through === 0) continue;
    const allDone = perRoundEntries.every((e) => e.through >= r.hole_count);
    if (!allDone) {
      liveRound = r;
      maxThrough = through;
      break;
    }
  }
  if (!liveRound) return null;
  return `R${liveRound.round_number} thru ${maxThrough}`;
}

const SIDE_GAME_LABEL: Record<SideGameSummary["kind"], string> = {
  poker: "Poker",
  best18: "Best 18",
  worst18: "Worst 18",
  most_same: "Most Same Number",
  scramble_winners: "3-Man Scramble Winners",
  stableford: "Stableford",
};

function LeaderboardView({
  standings,
  onPlayer,
}: {
  standings: EventStandings | null;
  onPlayer?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!standings) return <EmptyHint text="Loading…" />;
  if (standings.leaderboard.length === 0) {
    return <EmptyHint text="Leaderboard appears once scoring starts." />;
  }
  const ranks = computeRanks(standings.leaderboard);
  // Stableford enabled → show each player's running points alongside strokes.
  const pointsById = new Map((standings.stableford ?? []).map((s) => [s.player_id, s.points]));
  const showPoints = standings.stableford != null;
  return (
    <ul className="v2-card divide-y divide-[var(--v2-border)] !p-0">
      {standings.leaderboard.map((row, idx) => {
        const { rank, tied } = ranks[idx];
        const isLeader = rank === 1 && row.through > 0;
        const isOpen = expanded === row.player_id;
        return (
          <li key={row.player_id}>
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : row.player_id)}
              className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left"
            >
              <span
                className={`w-6 text-right text-[15px] ${isLeader ? "text-[var(--v2-gold)]" : "text-[var(--v2-text-dim)]"}`}
                style={serif}
              >
                {isLeader ? "👑" : row.through > 0 && tied ? `T${rank}` : rank}
              </span>
              <span
                role={onPlayer ? "button" : undefined}
                tabIndex={onPlayer ? 0 : undefined}
                onClick={
                  onPlayer
                    ? (e) => {
                        e.stopPropagation();
                        onPlayer(row.player_id);
                      }
                    : undefined
                }
                className={`flex-1 truncate text-sm text-[var(--v2-text)] ${onPlayer ? "underline decoration-dotted decoration-[var(--v2-text-faint)] underline-offset-2" : ""}`}
              >
                {row.display_name}
              </span>
              <span className="text-xs text-[var(--v2-text-dim)]">
                {row.through > 0 ? `thru ${row.through}` : "—"}
              </span>
              <span className="w-10 text-right text-sm font-semibold text-[var(--v2-text)]" style={serif}>
                {row.strokes || "–"}
              </span>
              <span className={`w-10 text-right text-xs font-semibold ${vsParTone(row.vs_par, row.through)}`}>
                {row.through === 0 ? "" : vsParLabel(row.vs_par)}
              </span>
              {showPoints && (
                <span className="w-12 text-right text-xs font-semibold text-[var(--v2-gold)]">
                  {row.through === 0 ? "" : `${pointsById.get(row.player_id) ?? 0} pt`}
                </span>
              )}
            </button>
            {isOpen && (
              <div className="border-t border-[var(--v2-border)] bg-[var(--v2-surface-2)]/40 px-3.5 py-2">
                {row.per_round.map((pr) => (
                  <div
                    key={pr.round_id}
                    className="flex items-center gap-3 py-0.5 text-xs text-[var(--v2-text-dim)]"
                  >
                    <span className="flex-1">Round {pr.round_number}</span>
                    <span>{pr.through > 0 ? `thru ${pr.through}` : "—"}</span>
                    <span className="w-10 text-right text-[var(--v2-text)]">{pr.strokes || "–"}</span>
                    <span className={`w-10 text-right font-semibold ${vsParTone(pr.vs_par, pr.through)}`}>
                      {pr.through === 0 ? "" : vsParLabel(pr.vs_par)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Assigns competition ranks (ties share a rank, next rank skips) keyed off the
 * already-sorted leaderboard. Two rows tie when they share both strokes and
 * holes-through, matching how the board is sorted.
 */
function computeRanks(
  rows: LeaderboardEntry[],
): { rank: number; tied: boolean }[] {
  const rankNums: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (
      i > 0 &&
      rows[i].strokes === rows[i - 1].strokes &&
      rows[i].through === rows[i - 1].through
    ) {
      rankNums.push(rankNums[i - 1]);
    } else {
      rankNums.push(i + 1);
    }
  }
  const counts = new Map<number, number>();
  for (const r of rankNums) counts.set(r, (counts.get(r) ?? 0) + 1);
  return rankNums.map((rank) => ({ rank, tied: (counts.get(rank) ?? 0) > 1 }));
}

function SideGamesView({
  eventId,
  isOrganizer,
  standings,
  reload,
  onPlayer,
}: {
  eventId: number;
  isOrganizer: boolean;
  standings: EventStandings | null;
  reload: () => void;
  onPlayer?: (id: string) => void;
}) {
  if (!standings) return <EmptyHint text="Loading…" />;
  if (standings.side_games.length === 0) {
    return <EmptyHint text="No side games enabled. The organizer can enable them in Manage." />;
  }
  return (
    <div className="space-y-3">
      {standings.side_games.map((g) => (
        <section key={g.kind} className="v2-card !p-0">
          <header className="flex items-center justify-between border-b border-[var(--v2-border)] px-3.5 py-2.5">
            <div className="text-sm font-semibold text-[var(--v2-text)]">{SIDE_GAME_LABEL[g.kind]}</div>
            <div className="text-xs text-[var(--v2-gold)]">Pot {formatMoney(g.pot_cents)}</div>
          </header>
          <div className="px-3.5 py-2.5">
            {g.kind === "best18" && <RankNumberList rows={mapBest(standings.best18)} onPlayer={onPlayer} />}
            {g.kind === "worst18" && <RankNumberList rows={mapWorst(standings.worst18)} onPlayer={onPlayer} />}
            {g.kind === "stableford" && <RankNumberList rows={mapStableford(standings.stableford)} unit="pts" onPlayer={onPlayer} />}
            {g.kind === "most_same" && <MostSameBlock rows={standings.most_same} />}
            {g.kind === "poker" && (
              <PokerWinnerBlock
                eventId={eventId}
                isOrganizer={isOrganizer}
                data={standings.poker}
                potCents={g.pot_cents}
                reload={reload}
              />
            )}
            {g.kind === "scramble_winners" && (
              <ScrambleWinnersBlock
                eventId={eventId}
                isOrganizer={isOrganizer}
                data={standings.scramble_winners}
                potCents={g.pot_cents}
                reload={reload}
              />
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function PokerWinnerBlock({
  eventId,
  isOrganizer,
  data,
  potCents,
  reload,
}: {
  eventId: number;
  isOrganizer: boolean;
  data: PokerStandings | null;
  potCents: number;
  reload: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pick(playerId: string | null) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/events/${eventId}/side-games/poker/winner`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ player_id: playerId }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed");
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Link
        href={`/events/${eventId}/poker`}
        className="inline-block text-sm font-medium text-[var(--v2-gold)] hover:underline"
      >
        Open poker hand →
      </Link>
      {err && (
        <div className="mt-2 rounded-md border border-[var(--v2-danger-border)] bg-[var(--v2-danger-bg)] px-2 py-1 text-xs text-[var(--v2-red-text)]">
          {err}
        </div>
      )}
      {!data || data.players.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--v2-text-dim)]">
          No poker hands dealt yet.
        </p>
      ) : (
        <ul className="mt-2 text-sm">
          {data.players.map((p) => {
            const isWinner = data.winner_player_id === p.player_id;
            return (
              <li
                key={p.player_id}
                className={`flex items-center gap-2 py-1 ${isWinner ? "-mx-2 rounded bg-[var(--v2-gold)]/12 px-2" : ""}`}
              >
                <span className="flex-1 truncate text-[var(--v2-text)]">
                  {p.display_name} {isWinner && "🏆"}
                </span>
                <span className="text-xs text-[var(--v2-text-dim)]">
                  {p.card_count} cards
                </span>
                {isOrganizer && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => pick(isWinner ? null : p.player_id)}
                    className="rounded border border-[var(--v2-border)] px-1.5 py-0.5 text-[10px] text-[var(--v2-text)] hover:border-[var(--v2-gold)]/50 disabled:opacity-50"
                  >
                    {isWinner ? "Unset" : "Win"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {data?.winner_player_id != null && data.payout_cents != null && (
        <div className="mt-2 text-xs text-[var(--v2-text-dim)]">
          Payout: {formatMoney(data.payout_cents)}
          {potCents > 0 ? ` (pot ${formatMoney(potCents)})` : ""}
        </div>
      )}
    </div>
  );
}

type RankRow = { player_id: string; display_name: string; value: number; partial: boolean };

function mapBest(rows: Best18Entry[] | null): RankRow[] | null {
  if (!rows) return null;
  return rows.map((r) => ({
    player_id: r.player_id,
    display_name: r.display_name,
    value: r.total,
    partial: !r.has_full_data,
  }));
}
function mapWorst(rows: Worst18Entry[] | null): RankRow[] | null {
  if (!rows) return null;
  return rows.map((r) => ({
    player_id: r.player_id,
    display_name: r.display_name,
    value: r.total,
    partial: !r.has_full_data,
  }));
}
function mapStableford(rows: StablefordEntry[] | null): RankRow[] | null {
  if (!rows) return null;
  return rows.map((r) => ({
    player_id: r.player_id,
    display_name: r.display_name,
    value: r.points,
    partial: !r.has_full_data,
  }));
}

function RankNumberList({
  rows,
  unit,
  onPlayer,
}: {
  rows: RankRow[] | null;
  unit?: string;
  onPlayer?: (id: string) => void;
}) {
  if (!rows || rows.length === 0)
    return <p className="text-xs text-[var(--v2-text-dim)]">No scores yet.</p>;
  return (
    <ul className="text-sm">
      {rows.map((r, idx) => (
        <li key={r.player_id} className="flex items-center gap-2 py-1">
          <span className="w-5 text-right text-xs text-[var(--v2-text-faint)]">{idx + 1}</span>
          {onPlayer ? (
            <button
              type="button"
              onClick={() => onPlayer(r.player_id)}
              className="min-w-0 flex-1 truncate text-left text-[var(--v2-text)] underline decoration-dotted decoration-[var(--v2-text-faint)] underline-offset-2"
            >
              {r.display_name}
            </button>
          ) : (
            <span className="flex-1 truncate text-[var(--v2-text)]">{r.display_name}</span>
          )}
          {r.partial && <span className="text-[10px] text-[var(--v2-amber-warn)]">partial</span>}
          <span className="font-semibold text-[var(--v2-text)]">
            {r.value ? `${r.value}${unit ? ` ${unit}` : ""}` : "–"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MostSameBlock({ rows }: { rows: MostSameEntry[] | null }) {
  if (!rows || rows.length === 0)
    return <p className="text-xs text-[var(--v2-text-dim)]">No scores yet.</p>;
  return (
    <ul className="text-sm">
      {rows.map((r, idx) => (
        <li key={r.player_id} className="flex items-center gap-2 py-1">
          <span className="w-5 text-right text-xs text-[var(--v2-text-faint)]">{idx + 1}</span>
          <span className="flex-1 truncate text-[var(--v2-text)]">{r.display_name}</span>
          <span className="text-xs text-[var(--v2-text-dim)]">
            {r.number != null ? `${r.count} × ${r.number}` : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ScrambleWinnersBlock({
  eventId,
  isOrganizer,
  data,
  potCents,
  reload,
}: {
  eventId: number;
  isOrganizer: boolean;
  data: ScrambleWinners | null;
  potCents: number;
  reload: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!data) {
    return <p className="text-xs text-[var(--v2-text-dim)]">Loading…</p>;
  }
  if (data.team_standings.length === 0) {
    return (
      <p className="text-xs text-[var(--v2-text-dim)]">
        No scramble teams yet. The organizer can create teams from the Manage page.
      </p>
    );
  }

  async function pick(teamId: number | null) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/events/${eventId}/side-games/scramble_winners/winner`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ team_id: teamId }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed");
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {err && (
        <div className="mb-2 rounded-md border border-[var(--v2-danger-border)] bg-[var(--v2-danger-bg)] px-2 py-1 text-xs text-[var(--v2-red-text)]">
          {err}
        </div>
      )}
      <ul className="text-sm">
        {data.team_standings.map((t, idx) => {
          const isWinner = data.winner_team_id === t.team_id;
          return (
            <li
              key={t.team_id}
              className={`flex items-center gap-2 py-1 ${isWinner ? "-mx-2 rounded bg-[var(--v2-gold)]/12 px-2" : ""}`}
            >
              <span className="w-5 text-right text-xs text-[var(--v2-text-faint)]">{idx + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[var(--v2-text)]">
                  {t.name} {isWinner && "🏆"}
                </div>
                <div className="truncate text-[10px] text-[var(--v2-text-dim)]">
                  {t.members.map((m) => m.display_name).join(", ")}
                </div>
              </div>
              <span className="text-xs text-[var(--v2-text-dim)]">
                {t.through > 0 ? `thru ${t.through}` : "—"}
              </span>
              <span className="font-semibold text-[var(--v2-text)]">{t.strokes || "–"}</span>
              {isOrganizer && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => pick(isWinner ? null : t.team_id)}
                  className="rounded border border-[var(--v2-border)] px-1.5 py-0.5 text-[10px] text-[var(--v2-text)] hover:border-[var(--v2-gold)]/50 disabled:opacity-50"
                >
                  {isWinner ? "Unset" : "Win"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {data.winner_team_id != null && data.payout_per_member_cents != null && (
        <div className="mt-2 text-xs text-[var(--v2-text-dim)]">
          Payout: {formatMoney(data.payout_per_member_cents)} per member
          {potCents > 0 ? ` (pot ${formatMoney(potCents)})` : ""}
        </div>
      )}
    </div>
  );
}

function PayoutsView({
  entryPotCents,
  standings,
  completed,
}: {
  entryPotCents: number;
  standings: EventStandings | null;
  completed: boolean;
}) {
  const sideTotal =
    standings?.side_games.reduce((sum, g) => sum + g.pot_cents, 0) ?? 0;
  return (
    <div className="space-y-3">
      <div className="v2-card">
        <div className="text-xs text-[var(--v2-text-dim)]">
          Entry pot{completed ? "" : " (estimated)"}
        </div>
        <div className="text-2xl font-semibold text-[var(--v2-gold)]" style={serif}>
          {formatMoney(entryPotCents)}
        </div>
      </div>
      <div className="v2-card">
        <div className="text-xs text-[var(--v2-text-dim)]">Side game pots</div>
        <div className="text-2xl font-semibold text-[var(--v2-gold)]" style={serif}>
          {formatMoney(sideTotal)}
        </div>
        {standings?.side_games && standings.side_games.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-[var(--v2-text-dim)]">
            {standings.side_games.map((g) => (
              <li key={g.kind} className="flex justify-between">
                <span>{SIDE_GAME_LABEL[g.kind]}</span>
                <span>{formatMoney(g.pot_cents)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {completed && standings && (
        <div className="v2-card">
          <div className="mb-2 text-sm font-semibold text-[var(--v2-text)]">Final payouts</div>
          <ul className="space-y-2 text-sm">
            {standings.side_games.map((g) => (
              <li
                key={g.kind}
                className="border-t border-[var(--v2-border)] pt-2 first:border-0 first:pt-0"
              >
                <div className="flex justify-between text-xs text-[var(--v2-text-dim)]">
                  <span>{SIDE_GAME_LABEL[g.kind]}</span>
                  <span>{formatMoney(g.pot_cents)}</span>
                </div>
                <FinalPayoutWinner kind={g.kind} potCents={g.pot_cents} standings={standings} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {completed && standings?.settlement && (
        <SettlementBlock settlement={standings.settlement} />
      )}

      {!completed && (
        <p className="text-xs text-[var(--v2-text-faint)]">
          Final payout summary lands when the event is marked completed.
        </p>
      )}
    </div>
  );
}

function SettlementBlock({ settlement }: { settlement: Settlement }) {
  if (settlement.total_pot_cents <= 0) return null;
  const net = (cents: number) =>
    cents > 0 ? `+${formatMoney(cents)}` : formatMoney(cents);
  return (
    <div className="v2-card">
      <div className="mb-1 text-sm font-semibold text-[var(--v2-text)]">Settle up</div>
      <p className="mb-2 text-[11px] text-[var(--v2-text-faint)]">
        Assumes everyone bought into each side game equally and the low score takes the entry pot.
      </p>

      {settlement.transfers.length > 0 ? (
        <ul className="space-y-1.5">
          {settlement.transfers.map((t, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="truncate text-[var(--v2-text)]">{t.from_name}</span>
              <span className="text-[var(--v2-text-faint)]">→</span>
              <span className="flex-1 truncate text-[var(--v2-text)]">{t.to_name}</span>
              <span className="font-semibold text-[var(--v2-gold)]">{formatMoney(t.amount_cents)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--v2-text-dim)]">Everyone&rsquo;s square — no payments needed.</p>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-[var(--v2-gold)]">Per-player net</summary>
        <ul className="mt-2 space-y-1 text-xs">
          {settlement.players.map((p) => (
            <li key={p.player_id} className="flex items-center gap-2">
              <span className="flex-1 truncate text-[var(--v2-text)]">{p.display_name}</span>
              <span className="text-[var(--v2-text-faint)]">
                in {formatMoney(p.paid_cents)} · won {formatMoney(p.won_cents)}
              </span>
              <span
                className={`w-16 text-right font-semibold ${p.net_cents > 0 ? "text-[var(--v2-sage)]" : p.net_cents < 0 ? "text-[var(--v2-red-text)]" : "text-[var(--v2-text-dim)]"}`}
              >
                {net(p.net_cents)}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function FinalPayoutWinner({
  kind,
  potCents,
  standings,
}: {
  kind: SideGameSummary["kind"];
  potCents: number;
  standings: EventStandings;
}) {
  if (kind === "best18" && standings.best18 && standings.best18.length > 0) {
    return (
      <PayoutWinnerLine
        name={standings.best18[0].display_name}
        detail={`Total ${standings.best18[0].total}`}
        amount={potCents}
      />
    );
  }
  if (kind === "worst18" && standings.worst18 && standings.worst18.length > 0) {
    return (
      <PayoutWinnerLine
        name={standings.worst18[0].display_name}
        detail={`Total ${standings.worst18[0].total}`}
        amount={potCents}
      />
    );
  }
  if (kind === "stableford" && standings.stableford && standings.stableford.length > 0) {
    const top = standings.stableford[0];
    return (
      <PayoutWinnerLine
        name={top.display_name}
        detail={`${top.points} pts`}
        amount={potCents}
      />
    );
  }
  if (kind === "most_same" && standings.most_same && standings.most_same.length > 0) {
    const top = standings.most_same[0];
    return (
      <PayoutWinnerLine
        name={top.display_name}
        detail={top.number != null ? `${top.count} × ${top.number}` : "No repeats"}
        amount={potCents}
      />
    );
  }
  if (kind === "scramble_winners" && standings.scramble_winners) {
    const sw = standings.scramble_winners;
    if (sw.winner_team_id == null) {
      return <p className="text-xs text-[var(--v2-text-dim)]">No winner selected.</p>;
    }
    const team = sw.team_standings.find((t) => t.team_id === sw.winner_team_id);
    if (!team) return <p className="text-xs text-[var(--v2-text-dim)]">Winning team missing.</p>;
    return (
      <div>
        <PayoutWinnerLine
          name={team.name}
          detail={team.members.map((m) => m.display_name).join(", ")}
          amount={potCents}
        />
        {sw.payout_per_member_cents != null && (
          <div className="mt-0.5 text-[10px] text-[var(--v2-text-dim)]">
            {formatMoney(sw.payout_per_member_cents)} per member
          </div>
        )}
      </div>
    );
  }
  if (kind === "poker") {
    const p = standings.poker;
    if (!p || p.winner_player_id == null) {
      return (
        <p className="text-xs text-[var(--v2-amber-warn)]">
          No winner picked yet. Set one in the Games tab.
        </p>
      );
    }
    const winner = p.players.find((x) => x.player_id === p.winner_player_id);
    return (
      <PayoutWinnerLine
        name={winner?.display_name ?? "Winner"}
        detail="Best poker hand"
        amount={p.payout_cents ?? potCents}
      />
    );
  }
  return <p className="text-xs text-[var(--v2-text-dim)]">No data.</p>;
}

function PayoutWinnerLine({
  name,
  detail,
  amount,
}: {
  name: string;
  detail?: string;
  amount: number;
}) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <span className="text-[var(--v2-gold)]">🏆</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-[var(--v2-text)]">{name}</div>
        {detail && <div className="truncate text-[10px] text-[var(--v2-text-dim)]">{detail}</div>}
      </div>
      <span className="text-sm font-semibold text-[var(--v2-gold)]">{formatMoney(amount)}</span>
    </div>
  );
}

function RulesView({ description }: { description: string | null }) {
  if (!description) {
    return <EmptyHint text="No rules / description set for this event." />;
  }
  return (
    <div className="v2-card whitespace-pre-wrap text-sm text-[var(--v2-text)]">{description}</div>
  );
}
