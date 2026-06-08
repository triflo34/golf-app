"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
        <div className="mb-2 rounded-lg border border-[var(--v2-danger-border)] bg-[var(--v2-danger-bg)] px-3 py-2 text-sm text-[var(--v2-red-text)]">
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

type RCPlayer = { user_id: string; display_name: string };
type UIRound = { format: "individual" | "scramble"; hole_count: number };

function buildTeams(map: Record<string, number | null>): string[][] {
  const byNum = new Map<number, string[]>();
  for (const [uid, n] of Object.entries(map)) {
    if (n == null) continue;
    if (!byNum.has(n)) byNum.set(n, []);
    byNum.get(n)!.push(uid);
  }
  return [...byNum.entries()].sort((a, b) => a[0] - b[0]).map(([, ids]) => ids);
}

// Pre-start: choose each round's format and, for scramble rounds, assign teams
// (uneven is fine). Saved to the event's round_config; the Start action turns
// these into real rounds + scramble teams.
function RoundSetupSection({
  eventId,
  onSaved,
}: {
  eventId: number;
  onSaved: () => Promise<void> | void;
}) {
  const [players, setPlayers] = useState<RCPlayer[]>([]);
  const [rounds, setRounds] = useState<UIRound[] | null>(null);
  const [assign, setAssign] = useState<Record<number, Record<string, number | null>>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/${eventId}/round-config`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(body.error ?? "Failed to load round setup");
      return;
    }
    setPlayers(body.players ?? []);
    setRounds(
      (body.rounds ?? []).map((r: { format: "individual" | "scramble"; hole_count: number }) => ({
        format: r.format,
        hole_count: r.hole_count,
      })),
    );
    const a: Record<number, Record<string, number | null>> = {};
    (body.rounds ?? []).forEach(
      (r: { teams?: string[][] }, i: number) => {
        a[i] = {};
        (r.teams ?? []).forEach((team, idx) => {
          for (const uid of team) a[i][uid] = idx + 1;
        });
      },
    );
    setAssign(a);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!rounds) return null;
  // A single individual round needs no setup screen.
  if (rounds.length === 1 && rounds[0].format === "individual" && players.length === 0) return null;

  function setFormat(i: number, format: "individual" | "scramble") {
    setRounds((rs) => rs!.map((r, idx) => (idx === i ? { ...r, format } : r)));
    setSavedMsg(false);
  }
  function setTeamNum(i: number, uid: string, value: string) {
    const n = value === "" ? null : Number(value);
    if (n != null && (!Number.isInteger(n) || n < 1 || n > 8)) return;
    setAssign((a) => ({ ...a, [i]: { ...(a[i] ?? {}), [uid]: n } }));
    setSavedMsg(false);
  }

  async function save() {
    setSaving(true);
    setErr(null);
    setSavedMsg(false);
    try {
      const payload = {
        rounds: rounds!.map((r, i) => ({
          format: r.format,
          teams: r.format === "scramble" ? buildTeams(assign[i] ?? {}) : [],
        })),
      };
      const res = await fetch(`/api/events/${eventId}/round-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      setSavedMsg(true);
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <SectionLabel>Round setup</SectionLabel>
      {err && (
        <div className="mb-2 rounded-lg border border-[var(--v2-danger-border)] bg-[var(--v2-danger-bg)] px-3 py-2 text-sm text-[var(--v2-red-text)]">
          {err}
        </div>
      )}
      <div className="space-y-3">
        {rounds.map((r, i) => (
          <div key={i} className="v2-card">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-[var(--v2-text)]">
                Round {i + 1} · {r.hole_count} holes
              </span>
              <div className="inline-flex overflow-hidden rounded-lg border border-[var(--v2-border)]">
                {(["individual", "scramble"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(i, f)}
                    className={`px-2.5 py-1 text-xs font-semibold capitalize ${
                      r.format === f
                        ? "bg-[var(--v2-gold)] text-[var(--v2-green-deep)]"
                        : "text-[var(--v2-text-dim)]"
                    }`}
                  >
                    {f === "individual" ? "Individual" : "Scramble"}
                  </button>
                ))}
              </div>
            </div>
            {r.format === "scramble" && (
              <div className="mt-2 border-t border-[var(--v2-border)] pt-2">
                <div className="mb-1 text-[11px] text-[var(--v2-text-dim)]">
                  Assign each player a team number (uneven teams are fine; leave blank to skip).
                </div>
                <ul className="divide-y divide-[var(--v2-border)]">
                  {players.map((p) => (
                    <li key={p.user_id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-sm text-[var(--v2-text)]">
                        {p.display_name}
                      </span>
                      <label className="flex items-center gap-1 text-xs text-[var(--v2-text-dim)]">
                        Team
                        <input
                          type="number"
                          min={1}
                          max={8}
                          value={assign[i]?.[p.user_id] ?? ""}
                          onChange={(e) => setTeamNum(i, p.user_id, e.target.value)}
                          className={`w-14 ${inputCls}`}
                        />
                      </label>
                    </li>
                  ))}
                </ul>
                {players.length === 0 && (
                  <div className="text-xs text-[var(--v2-text-faint)]">Add players first.</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={save} disabled={saving} className={`mt-2 ${goldBtn}`}>
        {saving ? "Saving…" : "Save round setup"}
      </button>
      {savedMsg && <span className="ml-2 text-xs text-[var(--v2-sage)]">Saved</span>}
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
  stableford: "Stableford",
};
const ALL_KINDS: SideGameKind[] = ["poker", "best18", "worst18", "most_same", "scramble_winners", "stableford"];

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
  // Debounce side-game saves so ticking a box / typing a pot is instant and
  // doesn't fire a network save + full reload on every keystroke.
  const sideSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          <div className="mt-3 rounded-lg border border-[var(--v2-danger-border)] bg-[var(--v2-danger-bg)] px-3 py-2 text-sm text-[var(--v2-red-text)]">
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

  function scheduleSideGameSave(entries: { kind: SideGameKind; pot_cents: number }[]) {
    if (sideSaveTimer.current) clearTimeout(sideSaveTimer.current);
    sideSaveTimer.current = setTimeout(() => {
      sideSaveTimer.current = null;
      void saveSideGames(entries);
    }, 400);
  }

  function toggleSideGame(kind: SideGameKind) {
    if (locked) return;
    const next = enabledKinds.has(kind)
      ? sideGames.filter((g) => g.kind !== kind)
      : [...sideGames, { id: 0, event_id: event!.id, kind, pot_cents: 0, config: null }];
    setSideGames(next); // optimistic — UI updates instantly
    setError(null);
    scheduleSideGameSave(next.map((g) => ({ kind: g.kind, pot_cents: g.pot_cents })));
  }

  function updatePot(kind: SideGameKind, dollars: number) {
    if (locked) return;
    const next = sideGames.map((g) =>
      g.kind === kind ? { ...g, pot_cents: Math.max(0, Math.round(dollars * 100)) } : g,
    );
    setSideGames(next); // optimistic — typing stays responsive
    setError(null);
    scheduleSideGameSave(next.map((g) => ({ kind: g.kind, pot_cents: g.pot_cents })));
  }

  // Persists in the background; no full reload on success (the optimistic state
  // is already authoritative). Only resync from the server if the save fails.
  async function saveSideGames(entries: { kind: SideGameKind; pot_cents: number }[]) {
    try {
      const res = await fetch(`/api/events/${id}/side-games`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side_games: entries }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Save failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      await reload();
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

  async function setExcludeFromLeaderboard(value: boolean) {
    setBusy(true);
    setError(null);
    setEvent((prev) => (prev ? { ...prev, exclude_from_leaderboard: value } : prev));
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exclude_from_leaderboard: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
      await reload();
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
          <div className="rounded-lg border border-[var(--v2-danger-border)] bg-[var(--v2-danger-bg)] px-3 py-2 text-sm text-[var(--v2-red-text)]">
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
                      className="text-xs text-[var(--v2-red-text)] hover:underline disabled:opacity-50"
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

        {/* Event settings — togglable any time, including after the event ends,
            so an event mistakenly hidden from stats can be brought back. */}
        <section>
          <SectionLabel>Event settings</SectionLabel>
          <label className="v2-card flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={!event.exclude_from_leaderboard}
              onChange={(e) => setExcludeFromLeaderboard(!e.target.checked)}
              disabled={busy}
              className="mt-0.5 accent-[var(--v2-gold)]"
            />
            <span>
              <span className="block text-sm text-[var(--v2-text)]">
                Count in overall stats &amp; leaderboards
              </span>
              <span className="mt-0.5 block text-xs text-[var(--v2-text-dim)]">
                When off, this event is left out of cross-event stats and season
                leaderboards.{" "}
                {event.exclude_from_leaderboard
                  ? "Currently hidden from stats."
                  : "Currently counted."}
              </span>
            </span>
          </label>
        </section>

        {/* Pre-start: pick each round's format + scramble teams. Post-start the
            round exists, so team edits move to ScrambleTeamsSection below. */}
        {!locked && <RoundSetupSection eventId={Number(id)} onSaved={reload} />}

        {scrambleData?.round_id && (
          <ScrambleTeamsSection
            eventId={Number(id)}
            players={players}
            scrambleData={scrambleData}
            disabled={event.status === "completed" || event.status === "archived"}
            onSaved={reload}
          />
        )}

        {!locked && (
          <section className="rounded-xl border border-[var(--v2-gold)]/30 bg-[var(--v2-gold)]/8 p-3.5">
            <div className="text-sm font-semibold text-[var(--v2-gold)]">Start event</div>
            <p className="mt-1 text-xs text-[var(--v2-text-dim)]">
              Locks the roster, side games, and round setup, creates the rounds, and seeds the poker
              deck if Poker is enabled.
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

        <section className="rounded-xl border border-[var(--v2-danger-border)] bg-[var(--v2-danger-bg)] p-3.5">
          <div className="text-sm font-semibold text-[var(--v2-red-text)]">Danger zone</div>
          <p className="mt-1 text-xs text-red-200/70">
            Permanently delete this event and all of its rounds, scores, side games, and poker
            state. This cannot be undone.
          </p>
          <button
            type="button"
            onClick={deleteEvent}
            disabled={busy}
            className="mt-2 w-full rounded-md border border-red-700 px-4 py-2 text-sm font-semibold text-[var(--v2-red-text)] hover:bg-red-700 hover:text-white disabled:opacity-50"
          >
            Delete event
          </button>
        </section>
      </div>
    </div>
  );
}
