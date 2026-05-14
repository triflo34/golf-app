"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import type { EventStatus } from "@/lib/types";
import type {
  Best18Entry,
  EventStandings,
  MostSameEntry,
  ScrambleWinners,
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

export default function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<LoadResult | null>(null);
  const [standings, setStandings] = useState<EventStandings | null>(null);
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
    if (!res.ok) return;
    setStandings(await res.json());
  }, [id]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  useEffect(() => {
    if (!user) return;
    loadStandings();
    const t = setInterval(loadStandings, 20_000);
    return () => clearInterval(t);
  }, [user, loadStandings]);

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
    (p) => p.user_id === user.id && p.role === "organizer",
  );
  const players = participants.filter((p) => p.role === "player");

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

        {isOrganizer && (
          <div className="mt-3 flex items-center gap-2">
            <Link
              href={`/events/${event.id}/manage`}
              className="text-sm font-medium text-green-700 hover:underline"
            >
              Manage event →
            </Link>
            {event.status === "draft" && (
              <span className="text-xs text-amber-700">
                · Add players and side games, then start
              </span>
            )}
          </div>
        )}
      </div>

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
        {tab === "live" && (
          <LiveTab eventId={event.id} players={players} rounds={rounds} />
        )}
        {tab === "side" && (
          <SideGamesView
            eventId={event.id}
            isOrganizer={isOrganizer}
            standings={standings}
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
      </section>
    </div>
  );
}

function LiveTab({
  eventId,
  players,
  rounds,
}: {
  eventId: number;
  players: Participant[];
  rounds: EventRound[];
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
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Players</h2>
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
          <li key={r.id}>
            <Link
              href={`/events/${eventId}/score/${r.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-3 hover:border-green-400"
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-gray-900">
                  Round {r.round_number}
                </div>
                <span className="text-xs text-gray-500 capitalize">
                  {r.round_format}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                {r.played_at} · {r.hole_count} holes
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <details className="text-xs text-gray-600">
        <summary className="cursor-pointer">Players ({players.length})</summary>
        <ul className="mt-2 divide-y divide-gray-100 border border-gray-200 rounded-md bg-white">
          {players.map((p) => (
            <li key={p.user_id} className="px-3 py-2 flex items-center justify-between">
              <span className="text-gray-900">{p.display_name}</span>
              {p.group_num != null && (
                <span className="text-gray-500">Group {p.group_num}</span>
              )}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

const SIDE_GAME_LABEL: Record<SideGameSummary["kind"], string> = {
  poker: "Poker",
  best18: "Best 18",
  worst18: "Worst 18",
  most_same: "Most Same Number",
  scramble_winners: "3-Man Scramble Winners",
};

function LeaderboardView({ standings }: { standings: EventStandings | null }) {
  if (!standings) return <EmptyHint text="Loading…" />;
  if (standings.leaderboard.length === 0) {
    return <EmptyHint text="Leaderboard appears once scoring starts." />;
  }
  return (
    <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md bg-white">
      {standings.leaderboard.map((row, idx) => (
        <li key={row.player_id} className="px-3 py-2 flex items-center gap-3">
          <span className="w-5 text-xs text-gray-400 text-right">{idx + 1}</span>
          <span className="flex-1 text-sm text-gray-900 truncate">
            {row.display_name}
          </span>
          <span className="text-xs text-gray-500">
            {row.through > 0 ? `thru ${row.through}` : "—"}
          </span>
          <span className="text-sm font-semibold text-gray-900 w-10 text-right">
            {row.strokes || "–"}
          </span>
          <span
            className={`w-10 text-right text-xs ${row.vs_par < 0 ? "text-red-600" : row.vs_par > 0 ? "text-gray-600" : "text-green-700"}`}
          >
            {row.through === 0
              ? ""
              : row.vs_par === 0
                ? "E"
                : row.vs_par > 0
                  ? `+${row.vs_par}`
                  : row.vs_par}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SideGamesView({
  eventId,
  isOrganizer,
  standings,
}: {
  eventId: number;
  isOrganizer: boolean;
  standings: EventStandings | null;
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
              <Link
                href={`/events/${eventId}/poker`}
                className="inline-block text-sm font-medium text-green-700 hover:underline"
              >
                Open poker hand →
              </Link>
            )}
            {g.kind === "scramble_winners" && (
              <ScrambleWinnersBlock
                eventId={eventId}
                isOrganizer={isOrganizer}
                data={standings.scramble_winners}
                potCents={g.pot_cents}
              />
            )}
          </div>
        </section>
      ))}
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
}: {
  eventId: number;
  isOrganizer: boolean;
  data: ScrambleWinners | null;
  potCents: number;
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

      {!completed && (
        <p className="text-xs text-gray-500">
          Final payout summary lands when the event is marked completed.
        </p>
      )}
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
    return (
      <p className="text-xs text-amber-700">
        Poker winner picked manually (not yet in MVP). Pay out from the pot total.
      </p>
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
