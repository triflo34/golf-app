"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import type { EventStatus, SideGame, SideGameKind, User } from "@/lib/types";

type ScrambleTeamData = {
  round_id: number | null;
  teams: {
    id: number;
    name: string;
    members: { user_id: string; display_name: string }[];
  }[];
};

const serif = { fontFamily: "var(--font-fraunces), Georgia, serif" };

const inputCls =
  "rounded-md border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-2 py-1 text-xs text-[var(--v2-text)]";
const goldBtn =
  "rounded-md bg-[var(--v2-gold)] px-3 py-2 text-sm font-semibold text-[var(--v2-green-deep)] disabled:opacity-50";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-text-dim)]">
      {children}
    </h2>
  );
}

function ScrambleTeamsSection({
  eventId,
  players,
  scrambleData,
  disabled,
  onSaved,
}: {
  eventId: number;
  players: {
    user_id: string;
    role: "organizer" | "player";
    is_organizer: boolean;
    group_num: number | null;
    display_name: string;
    username: string;
  }[];
  scrambleData: ScrambleTeamData | null;
  disabled: boolean;
  onSaved: () => Promise<void>;
}) {
  const initialAssignments = useMemo(() => {
    const m: Record<string, number | null> = {};
    if (!scrambleData) return m;
    scrambleData.teams.forEach((t, idx) => {
      for (const member of t.members) {
        m[member.user_id] = idx + 1;
      }
    });
    return m;
  }, [scrambleData]);
  const [assignments, setAssignments] = useState<Record<string, number | null>>(initialAssignments);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setAssignments(initialAssignments);
  }, [initialAssignments]);

  if (!scrambleData) return null;
  if (!scrambleData.round_id) {
    return (
      <section>
        <SectionLabel>Scramble teams</SectionLabel>
        <div className="v2-card text-sm text-[var(--v2-text-dim)]">
          Scramble round will be created when the event starts.
        </div>
      </section>
    );
  }

  function setTeamNum(userId: string, value: string) {
    const v = value === "" ? null : Number(value);
    if (v != null && (!Number.isInteger(v) || v < 1 || v > 20)) return;
    setAssignments((a) => ({ ...a, [userId]: v }));
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const byTeam = new Map<number, string[]>();
      for (const p of players) {
        const n = assignments[p.user_id];
        if (n != null) {
          if (!byTeam.has(n)) byTeam.set(n, []);
          byTeam.get(n)!.push(p.user_id);
        }
      }
      const teamsPayload = Array.from(byTeam.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([num, ids]) => ({ name: `Team ${num}`, member_ids: ids }));
      const res = await fetch(`/api/events/${eventId}/scramble-teams`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teams: teamsPayload }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <SectionLabel>Scramble teams (round 2)</SectionLabel>
      {err && (
        <div className="mb-2 rounded-lg border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-300">
          {err}
        </div>
      )}
      <ul className="v2-card divide-y divide-[var(--v2-border)] !p-0">
        {players.map((p) => (
          <li key={p.user_id} className="flex items-center justify-between gap-2 px-3.5 py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm text-[var(--v2-text)]">
              {p.display_name}
            </span>
            <label className="flex items-center gap-1 text-xs text-[var(--v2-text-dim)]">
              Team
              <input
                type="number"
                min={1}
                max={20}
                value={assignments[p.user_id] ?? ""}
                onChange={(e) => setTeamNum(p.user_id, e.target.value)}
                disabled={disabled}
                className={`w-14 ${inputCls}`}
              />
            </label>
          </li>
        ))}
      </ul>
      {!disabled && (
        <button type="button" onClick={save} disabled={saving} className={`mt-2 ${goldBtn}`}>
          {saving ? "Saving…" : "Save teams"}
        </button>
      )}
    </section>
  );
}

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

const SIDE_GAME_LABELS: Record<SideGameKind, string> = {
  poker: "Poker",
  best18: "Best 18",
  worst18: "Worst 18",
  most_same: "Most Same Number (R1)",
  scramble_winners: "3-Man Scramble Winners",
};
const ALL_KINDS: SideGameKind[] = ["poker", "best18", "worst18", "most_same", "scramble_winners"];

export function V2EventManage({ id }: { id: string }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [sideGames, setSideGames] = useState<SideGame[]>([]);
  const [scrambleData, setScrambleData] = useState<ScrambleTeamData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState("");

  const isOrganizer = useMemo(
    () => Boolean(user) && participants.some((p) => p.user_id === user?.id && p.is_organizer),
    [user, participants],
  );

  const players = useMemo(() => participants, [participants]);

  const enabledKinds = useMemo(() => new Set(sideGames.map((g) => g.kind)), [sideGames]);

  const reload = useCallback(async () => {
    setError(null);
    const [detail, users, games, teams] = await Promise.all([
      fetch(`/api/events/${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/users", { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/events/${id}/side-games`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/events/${id}/scramble-teams`, { cache: "no-store" }).then((r) => r.json()),
    ]);
    if (detail.error) {
      setError(detail.error);
      return;
    }
    setEvent(detail.event);
    setParticipants(detail.participants ?? []);
    setAllUsers(users.users ?? []);
    setSideGames(games.side_games ?? []);
    setScrambleData({ round_id: teams.round_id ?? null, teams: teams.teams ?? [] });
  }, [id]);

  useEffect(() => {
    if (user) reload();
  }, [user, reload]);

  if (authLoading || !user) {
    return (
      <div className="v2-bg flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-[var(--v2-gold)]">Loading…</div>
      </div>
    );
  }
  if (!event) {
    return (
      <div className="v2-bg min-h-screen px-4 py-6 text-[var(--v2-text)]">
        <Link href={`/events/${id}`} className="text-sm text-[var(--v2-gold)]">
          ← Event
        </Link>
        {error && (
          <div className="mt-3 rounded-lg border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>
    );
  }

  if (!isOrganizer) {
    return (
      <div className="v2-bg min-h-screen px-4 py-6 text-[var(--v2-text)]">
        <Link href={`/events/${id}`} className="text-sm text-[var(--v2-gold)]">
          ← Event
        </Link>
        <div className="mt-4 rounded-lg border border-[var(--v2-amber-warn)]/40 bg-[var(--v2-amber-warn)]/10 px-3 py-2 text-sm text-[var(--v2-amber-warn)]">
          Only organizers can manage this event.
        </div>
      </div>
    );
  }

  const locked =
    event.status === "in_progress" || event.status === "completed" || event.status === "archived";
  const participantIds = new Set(participants.map((p) => p.user_id));
  const candidates = allUsers.filter((u) => !participantIds.has(u.id));

  async function addPlayer() {
    if (!picker) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${id}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: picker }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Add failed");
      setPicker("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  async function removePlayer(userId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${id}/participants/${userId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Remove failed");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  async function setGroupNum(userId: string, groupNum: number | null) {
    setError(null);
    try {
      const res = await fetch(`/api/events/${id}/participants/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_num: groupNum }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function movePlayer(userId: string, dir: -1 | 1) {
    setError(null);
    const idx = players.findIndex((p) => p.user_id === userId);
    if (idx < 0) return;
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= players.length) return;
    const next = players.slice();
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    const ids = next.map((p) => p.user_id);
    setParticipants(next);
    try {
      const res = await fetch(`/api/events/${id}/participants/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ids: ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Reorder failed");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reorder failed");
      await reload();
    }
  }

  async function toggleSideGame(kind: SideGameKind) {
    if (locked) return;
    const next = enabledKinds.has(kind)
      ? sideGames.filter((g) => g.kind !== kind)
      : [...sideGames, { id: 0, event_id: event!.id, kind, pot_cents: 0, config: null }];
    await saveSideGames(next.map((g) => ({ kind: g.kind, pot_cents: g.pot_cents })));
  }

  async function updatePot(kind: SideGameKind, dollars: number) {
    if (locked) return;
    const next = sideGames.map((g) =>
      g.kind === kind ? { ...g, pot_cents: Math.max(0, Math.round(dollars * 100)) } : g,
    );
    await saveSideGames(next.map((g) => ({ kind: g.kind, pot_cents: g.pot_cents })));
  }

  async function saveSideGames(entries: { kind: SideGameKind; pot_cents: number }[]) {
    setError(null);
    try {
      const res = await fetch(`/api/events/${id}/side-games`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side_games: entries }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function completeEvent() {
    if (!confirm("Mark this event as completed? Final payouts will be calculated.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed");
      router.push(`/events/${id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteEvent() {
    if (
      !confirm(
        "Delete this event? All rounds, scores, side games, and poker state will be removed. This cannot be undone.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      router.push("/events");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setBusy(false);
    }
  }

  async function startEvent() {
    if (!confirm("Start the event? Roster and side games will be locked.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${id}/start`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Start failed");
      router.push(`/events/${id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Start failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="v2-bg min-h-screen text-[var(--v2-text)]">
      <div className="mx-auto max-w-lg space-y-6 px-4 py-6 pb-28">
        <div>
          <Link href={`/events/${id}`} className="text-sm text-[var(--v2-gold)]">
            ← {event.name}
          </Link>
          <h1 className="mt-2 text-[22px] font-medium text-[var(--v2-gold)]" style={serif}>
            Manage event
          </h1>
          <div className="text-xs text-[var(--v2-text-dim)]">
            Status: {event.status.replace("_", " ")}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Players */}
        <section>
          <SectionLabel>Players ({players.length}/8)</SectionLabel>
          {players.length === 0 ? (
            <div className="text-sm text-[var(--v2-text-dim)]">No players yet.</div>
          ) : (
            <ul className="v2-card divide-y divide-[var(--v2-border)] !p-0">
              {players.map((p, idx) => (
                <li key={p.user_id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => movePlayer(p.user_id, -1)}
                      disabled={busy || idx === 0}
                      aria-label="Move up"
                      className="h-5 w-6 text-xs text-[var(--v2-text-dim)] hover:text-[var(--v2-gold)] disabled:opacity-20"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => movePlayer(p.user_id, 1)}
                      disabled={busy || idx === players.length - 1}
                      aria-label="Move down"
                      className="h-5 w-6 text-xs text-[var(--v2-text-dim)] hover:text-[var(--v2-gold)] disabled:opacity-20"
                    >
                      ▼
                    </button>
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--v2-text)]">
                    {p.display_name}
                    {p.is_organizer && (
                      <span className="ml-1 rounded bg-[var(--v2-gold)]/20 px-1.5 py-0.5 align-middle text-[10px] text-[var(--v2-gold)]">
                        organizer
                      </span>
                    )}
                  </span>
                  <label className="flex items-center gap-1 text-xs text-[var(--v2-text-dim)]">
                    Group
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={p.group_num ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setGroupNum(p.user_id, v === "" ? null : Number(v));
                      }}
                      disabled={locked}
                      className={`w-14 ${inputCls}`}
                    />
                  </label>
                  {!locked && !p.is_organizer && (
                    <button
                      type="button"
                      onClick={() => removePlayer(p.user_id)}
                      disabled={busy}
                      className="text-xs text-red-300 hover:underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!locked && players.length < 8 && (
            <div className="mt-3 flex gap-2">
              <select
                value={picker}
                onChange={(e) => setPicker(e.target.value)}
                className="flex-1 rounded-md border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-sm text-[var(--v2-text)]"
              >
                <option value="">Add a player…</option>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={addPlayer} disabled={busy || !picker} className={goldBtn}>
                Add
              </button>
            </div>
          )}
        </section>

        {/* Side games */}
        <section>
          <SectionLabel>Side games</SectionLabel>
          <ul className="v2-card divide-y divide-[var(--v2-border)] !p-0">
            {ALL_KINDS.map((kind) => {
              const game = sideGames.find((g) => g.kind === kind);
              const enabled = Boolean(game);
              return (
                <li key={kind} className="flex items-center gap-2 px-3.5 py-2.5">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => toggleSideGame(kind)}
                    disabled={locked}
                    className="accent-[var(--v2-gold)]"
                  />
                  <span className="flex-1 text-sm text-[var(--v2-text)]">{SIDE_GAME_LABELS[kind]}</span>
                  {enabled && (
                    <label className="flex items-center gap-1 text-xs text-[var(--v2-text-dim)]">
                      Pot $
                      <input
                        type="number"
                        min={0}
                        step={5}
                        value={(game!.pot_cents / 100).toString()}
                        onChange={(e) => updatePot(kind, Number(e.target.value))}
                        disabled={locked}
                        className={`w-20 ${inputCls}`}
                      />
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <ScrambleTeamsSection
          eventId={Number(id)}
          players={players}
          scrambleData={scrambleData}
          disabled={event.status === "completed" || event.status === "archived"}
          onSaved={reload}
        />

        {!locked && (
          <section className="rounded-xl border border-[var(--v2-gold)]/30 bg-[var(--v2-gold)]/8 p-3.5">
            <div className="text-sm font-semibold text-[var(--v2-gold)]">Start event</div>
            <p className="mt-1 text-xs text-[var(--v2-text-dim)]">
              Locks the roster and side games, creates round 1 (individual) and round 2 (scramble),
              and seeds the poker deck if Poker is enabled.
            </p>
            <button
              type="button"
              onClick={startEvent}
              disabled={busy || players.length < 2}
              className={`mt-2 w-full ${goldBtn}`}
            >
              Start event
            </button>
            {players.length < 2 && (
              <p className="mt-1 text-xs text-[var(--v2-amber-warn)]">Need at least 2 players.</p>
            )}
          </section>
        )}

        {event.status === "in_progress" && (
          <section className="rounded-xl border border-[var(--v2-purple)]/35 bg-[var(--v2-purple)]/10 p-3.5">
            <div className="text-sm font-semibold text-[var(--v2-purple)]">Complete event</div>
            <p className="mt-1 text-xs text-[var(--v2-text-dim)]">
              Marks the event as Completed. Final payouts are computed from the standings.
            </p>
            <button
              type="button"
              onClick={completeEvent}
              disabled={busy}
              className="mt-2 w-full rounded-md bg-[var(--v2-purple)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Mark completed
            </button>
          </section>
        )}

        <section className="rounded-xl border border-red-900/50 bg-red-950/30 p-3.5">
          <div className="text-sm font-semibold text-red-300">Danger zone</div>
          <p className="mt-1 text-xs text-red-200/70">
            Permanently delete this event and all of its rounds, scores, side games, and poker
            state. This cannot be undone.
          </p>
          <button
            type="button"
            onClick={deleteEvent}
            disabled={busy}
            className="mt-2 w-full rounded-md border border-red-700 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-700 hover:text-white disabled:opacity-50"
          >
            Delete event
          </button>
        </section>
      </div>
    </div>
  );
}
