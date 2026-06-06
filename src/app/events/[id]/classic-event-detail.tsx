"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { CopyLinkButton } from "@/components/copy-link-button";
import { InvitePanel } from "@/components/invite-panel";
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

type TabKey = "live" | "side" | "leaderboard" | "payouts" | "rules";

const TABS: { key: TabKey; label: string }[] = [
  { key: "live", label: "Live Play" },
  { key: "side", label: "Side Games" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "payouts", label: "Payouts" },
  { key: "rules", label: "Rules" },
];

const STATUS_STYLES: Record<EventStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  open: "bg-blue-100 text-blue-800",
  in_progress: "bg-green-100 text-green-800",
  completed: "bg-purple-100 text-purple-800",
  archived: "bg-gray-200 text-gray-500",
};

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDateRange(start: string, end: string): string {
  if (start === end) return start;
  return `${start} → ${end}`;
}

export function ClassicEventDetail({ id }: { id: string }) {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<LoadResult | null>(null);
  const [standings, setStandings] = useState<EventStandings | null>(null);
  const [standingsError, setStandingsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  // Poll standings on a timer, but pause when the tab is hidden or the event
  // is in a state where nothing changes (draft, completed, archived).
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-green-700 text-lg">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href="/events" className="text-sm text-green-700">
          ← Events
        </Link>
        <div className="mt-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-green-700 text-lg">Loading event…</div>
      </div>
    );
  }

  const { event, participants, rounds } = data;
  const isOrganizer = participants.some(
    (p) => p.user_id === user.id && p.is_organizer,
  );
  // Everyone in event_participants is a player; organizer is an additional flag.
  const players = participants;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24">
      <Link href="/events" className="text-sm text-green-700">
        ← Events
      </Link>

      <div className="mt-3">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-bold text-green-800">{event.name}</h1>
          <span
            className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[event.status]}`}
          >
            {event.status.replace("_", " ")}
            {event.status === "in_progress" &&
              progressLabel(rounds, standings) && (
                <span className="ml-1 font-normal opacity-90">
                  · {progressLabel(rounds, standings)}
                </span>
              )}
          </span>
        </div>
        <div className="mt-1 text-sm text-gray-600">{event.course_name}</div>
        <div className="text-xs text-gray-500">
          {formatDateRange(event.start_date, event.end_date)}
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-gray-600">
          <span>{players.length} players</span>
          <span>·</span>
          <span>Entry {formatMoney(event.entry_fee_cents)}</span>
          {event.exclude_from_leaderboard && (
            <>
              <span>·</span>
              <span className="text-amber-700">Off leaderboard</span>
            </>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {isOrganizer && (
            <Link
              href={`/events/${event.id}/manage`}
              className="text-sm font-medium text-green-700 hover:underline"
            >
              Manage event →
            </Link>
          )}
          <CopyLinkButton path={`/events/${event.id}`} />
          {isOrganizer && event.status === "draft" && (
            <span className="text-xs text-amber-700">
              · Add players and side games, then start
            </span>
          )}
        </div>
      </div>

      {isOrganizer && (event.status === "draft" || event.status === "open") && (
        <div className="mt-4">
          <InvitePanel eventId={event.id} variant="classic" />
        </div>
      )}

      <nav className="mt-5 -mx-4 border-b border-gray-200 overflow-x-auto">
        <div className="flex px-4 gap-1 min-w-max">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === t.key
                  ? "border-green-700 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <section className="mt-4">
        {/* Board / Games / Payouts all need standings. If that endpoint failed,
            show the reason + a retry instead of hanging on "Loading…". */}
        {tab !== "live" && tab !== "rules" && standingsError && !standings ? (
          <StandingsError message={standingsError} onRetry={loadStandings} />
        ) : (
          <>
            {tab === "live" && (
              <LiveTab
                eventId={event.id}
                players={players}
                rounds={rounds}
                standings={standings}
              />
            )}
            {tab === "side" && (
              <SideGamesView
                eventId={event.id}
                isOrganizer={isOrganizer}
                standings={standings}
                reload={loadStandings}
              />
            )}
            {tab === "leaderboard" && <LeaderboardView standings={standings} />}
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
  );
}

function LiveTab({
  eventId,
  players,
  rounds,
  standings,
}: {
  eventId: number;
  players: Participant[];
  rounds: EventRound[];
  standings: EventStandings | null;
}) {
  if (players.length === 0) {
    return (
      <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-4 text-sm text-gray-600">
        No players yet. Organizer needs to add players before scoring can begin.
      </div>
    );
  }
  if (rounds.length === 0) {
    return (
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">
          Players ({players.length})
        </h2>
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md bg-white">
          {players.map((p) => (
            <li key={p.user_id} className="px-3 py-2 text-sm flex items-center justify-between">
              <span className="text-gray-900">{p.display_name}</span>
              {p.group_num != null && (
                <span className="text-xs text-gray-500">Group {p.group_num}</span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-gray-500">
          Rounds appear once the organizer starts the event.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-700">Rounds</h2>
      <ul className="space-y-2">
        {rounds.map((r) => (
          <RoundCard
            key={r.id}
            eventId={eventId}
            round={r}
            playerCount={players.length}
            standings={standings}
          />
        ))}
      </ul>
      <div>
        <h3 className="mt-4 mb-2 text-sm font-semibold text-gray-700">
          Players ({players.length})
        </h3>
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md bg-white text-sm">
          {players.map((p) => (
            <li key={p.user_id} className="px-3 py-2 flex items-center justify-between">
              <span className="text-gray-900">{p.display_name}</span>
              {p.group_num != null && (
                <span className="text-xs text-gray-500">Group {p.group_num}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RoundCard({
  eventId,
  round,
  playerCount,
  standings,
}: {
  eventId: number;
  round: EventRound;
  playerCount: number;
  standings: EventStandings | null;
}) {
  // Per-round mini-leaderboard sourced from standings.leaderboard[*].per_round.
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
  const maxThrough = miniRows.reduce((m, r) => Math.max(m, r.through), 0);
  // Players present in mini rows count once each. For scramble, this fans
  // out across team members, so use those who've recorded any hole.
  const playersScored = miniRows.filter((r) => r.through > 0).length;

  return (
    <li className="rounded-lg border border-gray-200 bg-white">
      <Link
        href={`/events/${eventId}/score/${round.id}`}
        className="block p-3 hover:bg-green-50 rounded-t-lg"
      >
        <div className="flex items-center justify-between">
          <div className="font-semibold text-gray-900">
            Round {round.round_number}
          </div>
          <span className="flex items-center gap-1.5 text-xs">
            {anyStarted && (
              <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                LIVE
              </span>
            )}
            <span className="text-gray-500 capitalize">
              {round.round_format}
            </span>
          </span>
        </div>
        <div className="text-xs text-gray-500">
          {round.played_at} · {round.hole_count} holes
          {anyStarted && (
            <>
              {" "}
              · thru hole {maxThrough} · {playersScored}/{playerCount}{" "}
              {round.round_format === "scramble" ? "scored" : "players in"}
            </>
          )}
        </div>
        {top.length > 0 && anyStarted && (
          <ul className="mt-2 space-y-0.5">
            {top.map((row, i) => {
              const vsParTone =
                row.through === 0
                  ? "text-gray-500"
                  : row.vs_par > 0
                    ? "text-red-600"
                    : row.vs_par < 0
                      ? "text-green-700"
                      : "text-gray-500";
              return (
                <li
                  key={row.player_id}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="w-4 text-gray-400 text-right">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate text-gray-800">
                    {row.display_name}
                  </span>
                  <span className="text-gray-500">
                    thru {row.through}
                  </span>
                  <span className="w-8 text-right text-gray-900 font-medium">
                    {row.strokes || "–"}
                  </span>
                  <span className={`w-10 text-right font-semibold ${vsParTone}`}>
                    {row.through === 0 ? "" : vsParLabel(row.vs_par)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Link>
      <div className="border-t border-gray-100 px-3 py-2 flex items-center justify-end">
        <Link
          href={`/events/${eventId}/scorecard/${round.id}`}
          className="text-xs font-medium text-green-700 hover:underline"
        >
          View scorecard →
        </Link>
      </div>
    </li>
  );
}

function vsParLabel(n: number): string {
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : String(n);
}

function progressLabel(
  rounds: EventRound[],
  standings: EventStandings | null,
): string | null {
  if (!standings) return null;
  // Find the lowest-numbered round that's started but not fully complete.
  // "Complete" = every player has reached the round's hole_count.
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
};

function vsParTone(vsPar: number, through: number): string {
  if (through === 0) return "text-gray-500";
  if (vsPar < 0) return "text-red-600";
  if (vsPar > 0) return "text-gray-600";
  return "text-green-700";
}

function LeaderboardView({ standings }: { standings: EventStandings | null }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!standings) return <EmptyHint text="Loading…" />;
  if (standings.leaderboard.length === 0) {
    return <EmptyHint text="Leaderboard appears once scoring starts." />;
  }
  const ranks = computeRanks(standings.leaderboard);
  return (
    <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md bg-white">
      {standings.leaderboard.map((row, idx) => {
        const { rank, tied } = ranks[idx];
        const isLeader = rank === 1 && row.through > 0;
        const isOpen = expanded === row.player_id;
        return (
          <li key={row.player_id}>
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : row.player_id)}
              className="w-full px-3 py-2 flex items-center gap-3 text-left hover:bg-green-50"
            >
              <span
                className={`w-6 text-xs text-right ${isLeader ? "text-green-700" : "text-gray-400"}`}
              >
                {isLeader ? "👑" : row.through > 0 && tied ? `T${rank}` : rank}
              </span>
              <span className="flex-1 text-sm text-gray-900 truncate">
                {row.display_name}
              </span>
              <span className="text-xs text-gray-500">
                {row.through > 0 ? `thru ${row.through}` : "—"}
              </span>
              <span className="text-sm font-semibold text-gray-900 w-10 text-right">
                {row.strokes || "–"}
              </span>
              <span className={`w-10 text-right text-xs ${vsParTone(row.vs_par, row.through)}`}>
                {row.through === 0 ? "" : vsParLabel(row.vs_par)}
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-gray-100 bg-gray-50 px-3 py-2">
                {row.per_round.map((pr) => (
                  <div
                    key={pr.round_id}
                    className="flex items-center gap-3 py-0.5 text-xs text-gray-600"
                  >
                    <span className="flex-1">Round {pr.round_number}</span>
                    <span>{pr.through > 0 ? `thru ${pr.through}` : "—"}</span>
                    <span className="w-10 text-right text-gray-900">{pr.strokes || "–"}</span>
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
 * Competition ranks (ties share a rank, next rank skips) over the already-sorted
 * leaderboard. Two rows tie when they share both strokes and holes-through.
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
}: {
  eventId: number;
  isOrganizer: boolean;
  standings: EventStandings | null;
  reload: () => void;
}) {
  if (!standings) return <EmptyHint text="Loading…" />;
  if (standings.side_games.length === 0) {
    return <EmptyHint text="No side games enabled. Organizer can enable them in Manage." />;
  }
  return (
    <div className="space-y-4">
      {standings.side_games.map((g) => (
        <section key={g.kind} className="rounded-md border border-gray-200 bg-white">
          <header className="px-3 py-2 flex items-center justify-between border-b border-gray-100">
            <div className="text-sm font-semibold text-gray-900">
              {SIDE_GAME_LABEL[g.kind]}
            </div>
            <div className="text-xs text-gray-500">Pot {formatMoney(g.pot_cents)}</div>
          </header>
          <div className="px-3 py-2">
            {g.kind === "best18" && <Best18Block rows={standings.best18} />}
            {g.kind === "worst18" && <Worst18Block rows={standings.worst18} />}
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
      const res = await fetch(`/api/events/${eventId}/side-games/poker/winner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: playerId }),
      });
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
        className="inline-block text-sm font-medium text-green-700 hover:underline"
      >
        Open poker hand →
      </Link>
      {err && (
        <div className="mt-2 rounded-md bg-red-50 border border-red-200 px-2 py-1 text-xs text-red-700">
          {err}
        </div>
      )}
      {!data || data.players.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">No poker hands dealt yet.</p>
      ) : (
        <ul className="mt-2 text-sm">
          {data.players.map((p) => {
            const isWinner = data.winner_player_id === p.player_id;
            return (
              <li
                key={p.player_id}
                className={`flex items-center gap-2 py-1 ${isWinner ? "bg-green-50 -mx-2 px-2 rounded" : ""}`}
              >
                <span className="flex-1 truncate text-gray-900">
                  {p.display_name} {isWinner && "🏆"}
                </span>
                <span className="text-xs text-gray-500">{p.card_count} cards</span>
                {isOrganizer && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => pick(isWinner ? null : p.player_id)}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 hover:border-green-500 disabled:opacity-50"
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
        <div className="mt-2 text-xs text-gray-600">
          Payout: {formatMoney(data.payout_cents)}
          {potCents > 0 ? ` (pot ${formatMoney(potCents)})` : ""}
        </div>
      )}
    </div>
  );
}

function Best18Block({ rows }: { rows: Best18Entry[] | null }) {
  if (!rows || rows.length === 0)
    return <p className="text-xs text-gray-500">No scores yet.</p>;
  return (
    <ul className="text-sm">
      {rows.map((r, idx) => (
        <li key={r.player_id} className="flex items-center gap-2 py-1">
          <span className="w-5 text-xs text-gray-400 text-right">{idx + 1}</span>
          <span className="flex-1 truncate text-gray-900">{r.display_name}</span>
          {!r.has_full_data && (
            <span className="text-[10px] text-amber-600">partial</span>
          )}
          <span className="font-semibold text-gray-900">{r.total || "–"}</span>
        </li>
      ))}
    </ul>
  );
}

function Worst18Block({ rows }: { rows: Worst18Entry[] | null }) {
  if (!rows || rows.length === 0)
    return <p className="text-xs text-gray-500">No scores yet.</p>;
  return (
    <ul className="text-sm">
      {rows.map((r, idx) => (
        <li key={r.player_id} className="flex items-center gap-2 py-1">
          <span className="w-5 text-xs text-gray-400 text-right">{idx + 1}</span>
          <span className="flex-1 truncate text-gray-900">{r.display_name}</span>
          {!r.has_full_data && (
            <span className="text-[10px] text-amber-600">partial</span>
          )}
          <span className="font-semibold text-gray-900">{r.total || "–"}</span>
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
    return <p className="text-xs text-gray-500">Loading…</p>;
  }
  if (data.team_standings.length === 0) {
    return (
      <p className="text-xs text-gray-500">
        No scramble teams yet. Organizer can create teams from the Manage page.
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
        <div className="mb-2 rounded-md bg-red-50 border border-red-200 px-2 py-1 text-xs text-red-700">
          {err}
        </div>
      )}
      <ul className="text-sm">
        {data.team_standings.map((t, idx) => {
          const isWinner = data.winner_team_id === t.team_id;
          return (
            <li
              key={t.team_id}
              className={`flex items-center gap-2 py-1 ${isWinner ? "bg-green-50 -mx-2 px-2 rounded" : ""}`}
            >
              <span className="w-5 text-xs text-gray-400 text-right">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-gray-900 truncate">
                  {t.name} {isWinner && "🏆"}
                </div>
                <div className="text-[10px] text-gray-500 truncate">
                  {t.members.map((m) => m.display_name).join(", ")}
                </div>
              </div>
              <span className="text-xs text-gray-500">
                {t.through > 0 ? `thru ${t.through}` : "—"}
              </span>
              <span className="font-semibold text-gray-900">{t.strokes || "–"}</span>
              {isOrganizer && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => pick(isWinner ? null : t.team_id)}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 hover:border-green-500 disabled:opacity-50"
                >
                  {isWinner ? "Unset" : "Win"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {data.winner_team_id != null && data.payout_per_member_cents != null && (
        <div className="mt-2 text-xs text-gray-600">
          Payout: ${(data.payout_per_member_cents / 100).toFixed(2)} per member
          {potCents > 0 ? ` (pot $${(potCents / 100).toFixed(2)})` : ""}
        </div>
      )}
    </div>
  );
}

function MostSameBlock({ rows }: { rows: MostSameEntry[] | null }) {
  if (!rows || rows.length === 0)
    return <p className="text-xs text-gray-500">No scores yet.</p>;
  return (
    <ul className="text-sm">
      {rows.map((r, idx) => (
        <li key={r.player_id} className="flex items-center gap-2 py-1">
          <span className="w-5 text-xs text-gray-400 text-right">{idx + 1}</span>
          <span className="flex-1 truncate text-gray-900">{r.display_name}</span>
          <span className="text-xs text-gray-600">
            {r.number != null ? `${r.count} × ${r.number}` : "—"}
          </span>
        </li>
      ))}
    </ul>
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
      <div className="rounded-md bg-white border border-gray-200 px-3 py-3">
        <div className="text-xs text-gray-500">
          Entry pot{completed ? "" : " (estimated)"}
        </div>
        <div className="text-2xl font-semibold text-green-800">
          {formatMoney(entryPotCents)}
        </div>
      </div>
      <div className="rounded-md bg-white border border-gray-200 px-3 py-3">
        <div className="text-xs text-gray-500">Side game pots</div>
        <div className="text-2xl font-semibold text-green-800">
          {formatMoney(sideTotal)}
        </div>
        {standings?.side_games && standings.side_games.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-gray-600">
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
        <div className="rounded-md bg-white border border-gray-200 px-3 py-3">
          <div className="text-sm font-semibold text-gray-900 mb-2">Final payouts</div>
          <ul className="space-y-2 text-sm">
            {standings.side_games.map((g) => (
              <li key={g.kind} className="border-t border-gray-100 pt-2 first:border-0 first:pt-0">
                <div className="flex justify-between text-xs text-gray-500">
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
        <p className="text-xs text-gray-500">
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
    <div className="rounded-md bg-white border border-gray-200 px-3 py-3">
      <div className="text-sm font-semibold text-gray-900 mb-1">Settle up</div>
      <p className="text-[11px] text-gray-500 mb-2">
        Assumes everyone bought into each side game equally and the low score takes the entry pot.
      </p>

      {settlement.transfers.length > 0 ? (
        <ul className="space-y-1.5">
          {settlement.transfers.map((t, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="truncate text-gray-900">{t.from_name}</span>
              <span className="text-gray-400">→</span>
              <span className="flex-1 truncate text-gray-900">{t.to_name}</span>
              <span className="font-semibold text-green-700">{formatMoney(t.amount_cents)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-500">Everyone&rsquo;s square — no payments needed.</p>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-green-700">Per-player net</summary>
        <ul className="mt-2 space-y-1 text-xs">
          {settlement.players.map((p) => (
            <li key={p.player_id} className="flex items-center gap-2">
              <span className="flex-1 truncate text-gray-900">{p.display_name}</span>
              <span className="text-gray-400">
                in {formatMoney(p.paid_cents)} · won {formatMoney(p.won_cents)}
              </span>
              <span
                className={`w-16 text-right font-semibold ${p.net_cents > 0 ? "text-green-700" : p.net_cents < 0 ? "text-red-600" : "text-gray-500"}`}
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
  if (kind === "most_same" && standings.most_same && standings.most_same.length > 0) {
    const top = standings.most_same[0];
    return (
      <PayoutWinnerLine
        name={top.display_name}
        detail={
          top.number != null
            ? `${top.count} × ${top.number}`
            : "No repeats"
        }
        amount={potCents}
      />
    );
  }
  if (kind === "scramble_winners" && standings.scramble_winners) {
    const sw = standings.scramble_winners;
    if (sw.winner_team_id == null) {
      return <p className="text-xs text-gray-500">No winner selected.</p>;
    }
    const team = sw.team_standings.find((t) => t.team_id === sw.winner_team_id);
    if (!team) return <p className="text-xs text-gray-500">Winning team missing.</p>;
    return (
      <div>
        <PayoutWinnerLine
          name={team.name}
          detail={team.members.map((m) => m.display_name).join(", ")}
          amount={potCents}
        />
        {sw.payout_per_member_cents != null && (
          <div className="text-[10px] text-gray-500 mt-0.5">
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
        <p className="text-xs text-amber-700">
          No winner picked yet. Set one in the Side Games tab.
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
  return <p className="text-xs text-gray-500">No data.</p>;
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
    <div className="flex items-center gap-2 mt-1">
      <span className="text-yellow-500">🏆</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 truncate">{name}</div>
        {detail && <div className="text-[10px] text-gray-500 truncate">{detail}</div>}
      </div>
      <span className="text-sm font-semibold text-green-700">{formatMoney(amount)}</span>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-4 text-sm text-gray-600">
      {text}
    </div>
  );
}

function StandingsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-md bg-red-50 border border-red-200 px-3 py-4">
      <div className="text-sm font-medium text-red-700">Couldn&apos;t load standings</div>
      <div className="mt-1 text-xs text-red-600 break-words">{message}</div>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:border-green-400"
      >
        Retry
      </button>
    </div>
  );
}

function RulesView({ description }: { description: string | null }) {
  if (!description) {
    return (
      <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-4 text-sm text-gray-600">
        No rules / description set for this event.
      </div>
    );
  }
  return (
    <div className="rounded-md bg-white border border-gray-200 px-3 py-3 whitespace-pre-wrap text-sm text-gray-800">
      {description}
    </div>
  );
}
