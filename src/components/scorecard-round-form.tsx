"use client";

import { useEffect, useMemo, useState } from "react";
import type { Course, User } from "@/lib/types";
import type { CourseHoleDetail } from "@/app/api/courses/[id]/route";
import {
  ScorecardUploader,
  type ParseResult,
} from "@/components/scorecard-uploader";
import {
  ScorecardGrid,
  type EntryMode,
  type GridPlayer,
} from "@/components/scorecard-grid";

export type ScorecardPayload = {
  course_id: number;
  played_at: string;
  hole_count: 9 | 18;
  notes: string | null;
  players: { player_id: string; strokes: number[] }[];
};

type Variant = "classic" | "v2";

export type ScorecardFormInitial = {
  courseId: number | null;
  playedAt: string;
  holeCount: 9 | 18;
  notes: string;
  /** Existing per-player strokes. null in a slot = blank hole. */
  players: { user: User; strokes: (number | null)[] }[];
};

type Props = {
  me: User;
  onSubmit: (payload: ScorecardPayload) => Promise<void>;
  variant?: Variant;
  /** When provided, hydrate the form for editing an existing round. */
  initial?: ScorecardFormInitial;
  /** Override the submit button label. Defaults to "Save scorecard". */
  submitLabel?: string;
};

// All variant-dependent class strings live here so the JSX stays readable
// while supporting both the classic light theme and v2 dark theme.
function styles(variant: Variant) {
  const v2 = variant === "v2";
  return {
    errorBox: v2
      ? "rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300"
      : "rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700",
    card: v2
      ? "rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-4"
      : "card",
    cardGrid: v2
      ? "rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
      : "card grid grid-cols-1 sm:grid-cols-2 gap-3",
    label: v2
      ? "block text-sm font-medium text-[var(--v2-muted)] mb-1"
      : "block text-sm font-medium text-gray-700 mb-1",
    input: v2
      ? "w-full rounded-md border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-sm text-white placeholder-[var(--v2-muted)] focus:border-[var(--v2-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--v2-accent)]/40"
      : "w-full rounded-md border border-gray-300 px-3 py-2 text-sm",
    inputDate: v2
      ? "w-full min-w-0 rounded-md border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-sm text-white focus:border-[var(--v2-accent)] focus:outline-none"
      : "w-full min-w-0 rounded-md border border-gray-300 px-3 py-2 text-sm",
    selectedCourseBox: v2
      ? "flex items-center justify-between rounded-lg bg-[var(--v2-surface-2)] px-3 py-2"
      : "flex items-center justify-between bg-green-50 rounded-lg px-3 py-2",
    selectedCourseName: v2 ? "font-semibold text-white" : "font-semibold text-gray-800",
    selectedCourseMeta: v2 ? "text-xs text-[var(--v2-muted)]" : "text-xs text-gray-500",
    changeBtn: v2
      ? "text-xs text-[var(--v2-accent)] hover:underline"
      : "text-xs text-green-700 hover:underline",
    parWarning: v2
      ? "mt-2 rounded-md border border-amber-700 bg-amber-950/40 px-3 py-2 text-xs text-amber-200"
      : "mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900",
    parWarningBtn: v2
      ? "rounded-md bg-amber-600 text-black px-2.5 py-1 font-medium disabled:opacity-50"
      : "rounded-md bg-amber-700 text-white px-2.5 py-1 font-medium disabled:opacity-50",
    parWarningMsg: v2 ? "text-amber-300" : "text-amber-800",
    courseList: v2
      ? "mt-2 max-h-48 overflow-y-auto divide-y divide-[var(--v2-border)] border border-[var(--v2-border)] rounded-md bg-[var(--v2-surface-2)]"
      : "mt-2 max-h-48 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-md bg-white",
    courseListRow: v2
      ? "w-full text-left px-3 py-2 text-sm hover:bg-[var(--v2-surface)]"
      : "w-full text-left px-3 py-2 text-sm hover:bg-green-50",
    courseListName: v2 ? "font-medium text-white" : "font-medium text-gray-800",
    courseListMeta: v2 ? "text-xs text-[var(--v2-muted)]" : "text-xs text-gray-500",
    courseListEmpty: v2
      ? "px-3 py-3 text-xs text-[var(--v2-muted)]"
      : "px-3 py-3 text-xs text-gray-500",
    holesSegment: v2
      ? "flex bg-[var(--v2-surface-2)] rounded-md p-0.5 text-xs font-medium"
      : "flex bg-gray-100 rounded-md p-0.5 text-xs font-medium",
    holesActive: v2
      ? "flex-1 px-2 py-1.5 rounded bg-[var(--v2-accent)] text-black"
      : "flex-1 px-2 py-1.5 rounded bg-white text-green-700 shadow-sm",
    holesIdle: v2
      ? "flex-1 px-2 py-1.5 rounded text-[var(--v2-muted)]"
      : "flex-1 px-2 py-1.5 rounded text-gray-500",
    helperNote: v2 ? "text-xs text-[var(--v2-muted)] mb-2" : "text-xs text-gray-500 mb-2",
    playerInput: v2
      ? "w-full rounded-md border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-sm text-white placeholder-[var(--v2-muted)] disabled:bg-[var(--v2-surface)] focus:border-[var(--v2-accent)] focus:outline-none"
      : "w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50",
    playerDropdown: v2
      ? "absolute z-10 mt-1 w-full max-h-48 overflow-y-auto divide-y divide-[var(--v2-border)] border border-[var(--v2-border)] rounded-md bg-[var(--v2-surface-2)] shadow-2xl shadow-black/40"
      : "absolute z-10 mt-1 w-full max-h-48 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-md bg-white shadow-sm",
    playerDropdownRow: v2
      ? "w-full text-left px-3 py-2 text-sm hover:bg-[var(--v2-surface)]"
      : "w-full text-left px-3 py-2 text-sm hover:bg-green-50",
    playerDropdownName: v2 ? "font-medium text-white" : "font-medium text-gray-800",
    playerDropdownUsername: v2 ? "text-xs text-[var(--v2-muted)]" : "text-xs text-gray-500",
    parseEmpty: v2
      ? "mt-3 rounded-md border border-amber-700 bg-amber-950/40 px-3 py-2 text-xs text-amber-200"
      : "mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900",
    parseEmptyDebug: v2 ? "text-amber-300 text-[11px] break-all" : "text-amber-700 text-[11px] break-all",
    parseHelp: v2 ? "text-xs text-[var(--v2-muted)]" : "text-xs text-gray-600",
    parseList: v2
      ? "divide-y divide-[var(--v2-border)] border border-[var(--v2-border)] rounded-md"
      : "divide-y divide-gray-100 border border-gray-200 rounded-md",
    parseRowLabel: v2 ? "font-medium text-white" : "font-medium text-gray-700",
    parseRowMeta: v2 ? "text-[var(--v2-muted)]" : "text-gray-400",
    parsePreview: v2 ? "font-mono text-[var(--v2-fg)] mb-2 break-all" : "font-mono text-gray-700 mb-2 break-all",
    parseAssignBtn: v2
      ? "px-2 py-1 rounded bg-[var(--v2-accent)] text-black font-medium hover:bg-[var(--v2-accent-soft)]"
      : "px-2 py-1 rounded bg-green-700 text-white font-medium hover:bg-green-800",
    entryModeActive: v2
      ? "px-2.5 py-1 rounded transition bg-[var(--v2-accent)] text-black"
      : "px-2.5 py-1 rounded transition bg-white text-green-700 shadow-sm",
    entryModeIdle: v2
      ? "px-2.5 py-1 rounded transition text-[var(--v2-muted)]"
      : "px-2.5 py-1 rounded transition text-gray-500",
    submitBtn: v2
      ? "w-full rounded-lg bg-[var(--v2-accent)] px-4 py-2.5 font-semibold text-black hover:bg-[var(--v2-accent-soft)] disabled:opacity-50"
      : "w-full rounded-md bg-green-700 px-4 py-2.5 text-white font-semibold disabled:opacity-50",
  };
}

export function ScorecardRoundForm({
  me,
  onSubmit,
  variant = "classic",
  initial,
  submitLabel = "Save scorecard",
}: Props) {
  const cls = styles(variant);
  const [courses, setCourses] = useState<Course[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [courseId, setCourseId] = useState<number | null>(
    initial?.courseId ?? null,
  );
  const [courseQuery, setCourseQuery] = useState("");
  const [holeMeta, setHoleMeta] = useState<CourseHoleDetail[]>([]);
  const [holeCount, setHoleCount] = useState<9 | 18>(
    initial?.holeCount ?? 18,
  );
  const [playedAt, setPlayedAt] = useState(
    initial?.playedAt ?? new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [players, setPlayers] = useState<GridPlayer[]>(() =>
    initial && initial.players.length > 0
      ? initial.players.map((p) => ({ user: p.user, strokes: p.strokes.slice() }))
      : [{ user: me, strokes: Array.from({ length: 18 }, () => null) }],
  );
  const [playerQuery, setPlayerQuery] = useState("");
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [parse, setParse] = useState<ParseResult | null>(null);
  const [entryMode, setEntryMode] = useState<EntryMode>("strokes");
  const [refreshingCourse, setRefreshingCourse] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/courses")
      .then((r) => r.json())
      .then((d) => setCourses(d.courses ?? []));
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []));
  }, []);

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === courseId) ?? null,
    [courses, courseId],
  );

  async function applyCourseDetail(d: {
    course?: Course;
    holes?: CourseHoleDetail[];
  }) {
    setHoleMeta(d.holes ?? []);
    const ch = d.course?.holes;
    if (ch === 9 || ch === 18) {
      setHoleCount(ch);
      setPlayers((prev) =>
        prev.map((p) => ({ ...p, strokes: resizeStrokes(p.strokes, ch) })),
      );
    }
    // Keep the local courses list fresh so selectedCourse picks up any
    // server-side rename / re-link from a refresh.
    if (d.course) {
      const fresh = d.course;
      setCourses((prev) => prev.map((c) => (c.id === fresh.id ? fresh : c)));
    }
  }

  // Pull per-hole pars whenever the course changes. Stale meta is harmless —
  // the grid only matters once a course is picked and the next fetch refreshes
  // it — so we don't clear on courseId becoming null.
  useEffect(() => {
    if (!courseId) return;
    let canceled = false;
    (async () => {
      const res = await fetch(`/api/courses/${courseId}`, { cache: "no-store" });
      const d = await res.json();
      if (canceled) return;
      await applyCourseDetail(d);
    })();
    return () => {
      canceled = true;
    };
  }, [courseId]);

  async function refreshCourseFromApi() {
    if (!courseId) return;
    setRefreshingCourse(true);
    setRefreshMessage(null);
    try {
      const res = await fetch(`/api/courses/${courseId}/refresh`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Refresh failed");
      const detail = await fetch(`/api/courses/${courseId}`, {
        cache: "no-store",
      });
      const d = await detail.json();
      await applyCourseDetail(d);
      setRefreshMessage(`Updated — ${body.holes ?? "?"} holes loaded.`);
    } catch (e) {
      setRefreshMessage(
        e instanceof Error ? `Refresh failed: ${e.message}` : "Refresh failed",
      );
    } finally {
      setRefreshingCourse(false);
    }
  }

  const pars = useMemo(() => {
    const arr = Array<number>(holeCount).fill(4);
    for (const h of holeMeta) {
      if (h.hole_number >= 1 && h.hole_number <= holeCount) {
        arr[h.hole_number - 1] = h.par;
      }
    }
    return arr;
  }, [holeMeta, holeCount]);

  const filteredUsers = useMemo(() => {
    const takenUserIds = new Set(players.map((p) => p.user.id));
    const q = playerQuery.trim().toLowerCase();
    return users
      .filter((u) => !takenUserIds.has(u.id))
      .filter(
        (u) =>
          !q ||
          u.display_name.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [users, playerQuery, players]);

  const filteredCourses = useMemo(() => {
    const q = courseQuery.trim().toLowerCase();
    if (!q) return courses.slice(0, 20);
    return courses
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [courses, courseQuery]);

  function addPlayer(u: User) {
    if (players.length >= 8) return;
    setPlayers((arr) => [
      ...arr,
      { user: u, strokes: Array.from({ length: holeCount }, () => null) },
    ]);
    setPlayerQuery("");
    setShowPlayerPicker(false);
  }

  function removePlayer(userId: string) {
    setPlayers((arr) => arr.filter((p) => p.user.id !== userId));
  }

  // Claude Vision returns strokes already aligned to holes (no entry-mode
  // conversion needed — it always reports absolute strokes). We store the
  // parsed rows and present a per-row "Apply to..." picker so the user can
  // confirm or re-route each detected row before it overwrites the grid.
  function applyParse(result: ParseResult) {
    setParse(result);
  }

  function applyDetectedRow(rowIdx: number, userId: string) {
    if (!parse) return;
    const detected = parse.players[rowIdx];
    if (!detected) return;
    const next: (number | null)[] = Array(holeCount).fill(null);
    for (let i = 0; i < holeCount; i++) {
      const v = detected.strokes[i];
      if (typeof v === "number" && v >= 1 && v <= 20) next[i] = v;
    }
    setPlayers((prev) =>
      prev.map((p) => (p.user.id === userId ? { ...p, strokes: next } : p)),
    );
  }

  async function submit() {
    setError("");
    if (!courseId) return setError("Pick a course");
    if (!playedAt) return setError("Pick a date");
    if (players.length === 0) return setError("Add at least one player");

    const payloadPlayers: ScorecardPayload["players"] = [];
    for (const p of players) {
      const strokes = p.strokes.slice(0, holeCount);
      if (strokes.length !== holeCount || strokes.some((s) => s == null)) {
        return setError(
          `Fill every hole for ${p.user.display_name} (${strokes.filter((s) => s != null).length}/${holeCount})`,
        );
      }
      payloadPlayers.push({
        player_id: p.user.id,
        strokes: strokes as number[],
      });
    }

    try {
      setSubmitting(true);
      await onSubmit({
        course_id: courseId,
        played_at: playedAt,
        hole_count: holeCount,
        notes: notes.trim() || null,
        players: payloadPlayers,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <div className={cls.errorBox}>{error}</div>}

      <div className={cls.card}>
        <label className={cls.label}>Course</label>
        {selectedCourse ? (
          <>
            <div className={cls.selectedCourseBox}>
              <div>
                <div className={cls.selectedCourseName}>
                  {selectedCourse.name}
                </div>
                <div className={cls.selectedCourseMeta}>
                  {selectedCourse.city}, {selectedCourse.state} · par{" "}
                  {selectedCourse.par} · {selectedCourse.holes} holes
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCourseId(null)}
                className={cls.changeBtn}
              >
                Change
              </button>
            </div>
            {needsParsRefresh(holeMeta) && (
              <div className={cls.parWarning}>
                {selectedCourse.external_id ? (
                  <>
                    <p>
                      Per-hole pars look like placeholders (all 4s). Pull real
                      data from GolfCourseAPI?
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={refreshCourseFromApi}
                        disabled={refreshingCourse}
                        className={cls.parWarningBtn}
                      >
                        {refreshingCourse
                          ? "Refreshing…"
                          : "Refresh pars from API"}
                      </button>
                      {refreshMessage && (
                        <span className={cls.parWarningMsg}>{refreshMessage}</span>
                      )}
                    </div>
                  </>
                ) : (
                  <p>
                    Per-hole pars look like placeholders (all 4s) and this
                    course isn&apos;t linked to GolfCourseAPI. Open it from the{" "}
                    <span className="font-medium">Courses</span> tab to add
                    pars manually or re-link.
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <div>
            <input
              type="text"
              value={courseQuery}
              onChange={(e) => setCourseQuery(e.target.value)}
              placeholder="Search course…"
              className={cls.input}
            />
            <ul className={cls.courseList}>
              {filteredCourses.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCourseId(c.id);
                      setCourseQuery("");
                    }}
                    className={cls.courseListRow}
                  >
                    <div className={cls.courseListName}>{c.name}</div>
                    <div className={cls.courseListMeta}>
                      {c.city}, {c.state} · {c.holes} holes
                    </div>
                  </button>
                </li>
              ))}
              {filteredCourses.length === 0 && (
                <li className={cls.courseListEmpty}>
                  No courses match — add one from the Courses tab first.
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      <div className={cls.cardGrid}>
        <div className="min-w-0">
          <label className={cls.label}>Date played</label>
          <input
            type="date"
            value={playedAt}
            onChange={(e) => setPlayedAt(e.target.value)}
            className={cls.inputDate}
          />
        </div>
        <div className="min-w-0">
          <label className={cls.label}>Holes</label>
          <div className={cls.holesSegment}>
            {([9, 18] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => {
                  setHoleCount(h);
                  setPlayers((prev) =>
                    prev.map((p) => ({
                      ...p,
                      strokes: resizeStrokes(p.strokes, h),
                    })),
                  );
                }}
                className={holeCount === h ? cls.holesActive : cls.holesIdle}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={cls.card}>
        <label className={cls.label}>Players ({players.length}/8)</label>
        <p className={cls.helperNote}>
          Per-hole stats need registered users — guests aren&apos;t supported in
          this flow. Use Type Scores for guest rounds.
        </p>
        <div className="relative">
          <input
            type="text"
            value={playerQuery}
            onChange={(e) => {
              setPlayerQuery(e.target.value);
              setShowPlayerPicker(true);
            }}
            onFocus={() => setShowPlayerPicker(true)}
            placeholder="Add a player by name"
            disabled={players.length >= 8}
            className={cls.playerInput}
          />
          {showPlayerPicker && filteredUsers.length > 0 && (
            <ul className={cls.playerDropdown}>
              {filteredUsers.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => addPlayer(u)}
                    className={cls.playerDropdownRow}
                  >
                    <div className={cls.playerDropdownName}>
                      {u.display_name}
                    </div>
                    <div className={cls.playerDropdownUsername}>@{u.username}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className={cls.card}>
        <label className={`${cls.label} mb-2`}>Scorecard photo (optional)</label>
        <ScorecardUploader
          holeCount={holeCount}
          playerNames={players.map((p) => p.user.display_name)}
          pars={pars}
          entryMode={entryMode}
          onResult={applyParse}
          disabled={submitting || !courseId}
          variant={variant}
        />
        {parse && parse.players.length === 0 && (
          <div className={cls.parseEmpty}>
            Claude couldn&apos;t find any player rows on this photo. Try a
            clearer photo, or type the scores in manually.
            {parse.rawError && (
              <div className={`mt-1 ${cls.parseEmptyDebug}`}>
                {parse.rawError}
              </div>
            )}
          </div>
        )}
        {parse && parse.players.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className={cls.parseHelp}>
              Claude detected {parse.players.length} row
              {parse.players.length === 1 ? "" : "s"}. Tap which player each row
              belongs to.
            </div>
            <ul className={cls.parseList}>
              {parse.players.map((row, rowIdx) => {
                const counted = row.strokes.filter(
                  (s) => typeof s === "number",
                ).length;
                const preview = row.strokes
                  .slice(0, holeCount)
                  .map((s) => (s == null ? "·" : String(s)))
                  .join(" ");
                return (
                  <li key={rowIdx} className="p-2 text-xs">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={cls.parseRowLabel}>
                        Row {rowIdx + 1}
                      </span>
                      <span className={cls.parseRowMeta}>
                        {counted}/{holeCount} holes read
                      </span>
                    </div>
                    <div className={cls.parsePreview}>{preview}</div>
                    <div className="flex flex-wrap gap-1">
                      {players.map((p) => (
                        <button
                          key={p.user.id}
                          type="button"
                          onClick={() => applyDetectedRow(rowIdx, p.user.id)}
                          className={cls.parseAssignBtn}
                        >
                          Use for {p.user.display_name}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div className={cls.card}>
        <div className="flex items-center justify-between mb-2">
          <label className={cls.label}>Scores</label>
          <div className={cls.holesSegment}>
            <button
              type="button"
              onClick={() => setEntryMode("strokes")}
              className={
                entryMode === "strokes" ? cls.entryModeActive : cls.entryModeIdle
              }
              title="Type the actual stroke count (4, 5, 6…)"
            >
              Strokes
            </button>
            <button
              type="button"
              onClick={() => setEntryMode("to_par")}
              className={
                entryMode === "to_par" ? cls.entryModeActive : cls.entryModeIdle
              }
              title="Type diff vs par: 0 = par, -1 = birdie, 1 = bogey…"
            >
              vs Par
            </button>
          </div>
        </div>
        {entryMode === "to_par" && (
          <p className={`text-[11px] mb-2 ${variant === "v2" ? "text-[var(--v2-muted)]" : "text-gray-500"}`}>
            <span className="font-medium">0</span> = par,{" "}
            <span className="font-medium">-1</span> = birdie,{" "}
            <span className="font-medium">1</span> = bogey. Saved as actual
            strokes.
          </p>
        )}
        {players.length === 0 ? (
          <p className={cls.helperNote}>Add a player above.</p>
        ) : (
          <ScorecardGrid
            holeCount={holeCount}
            pars={pars}
            players={players}
            onChange={setPlayers}
            onRemovePlayer={removePlayer}
            entryMode={entryMode}
            variant={variant}
          />
        )}
      </div>

      <div className={cls.card}>
        <label className={cls.label}>Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={cls.input}
        />
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={submitting || !courseId || players.length === 0}
        className={cls.submitBtn}
      >
        {submitting ? "Saving…" : submitLabel}
      </button>
    </div>
  );
}

function resizeStrokes(prev: (number | null)[], n: 9 | 18): (number | null)[] {
  const next = Array<number | null>(n).fill(null);
  for (let i = 0; i < Math.min(prev.length, n); i++) next[i] = prev[i];
  return next;
}

/**
 * `ensureCourseHoles` seeds a course with placeholder pars (mostly 4s) until
 * real data lands. We treat "every hole is par 4" as a strong signal that the
 * course hasn't been populated from GolfCourseAPI yet and prompt the user to
 * refresh. False positives (real par-72 courses with all 4s) are rare and the
 * refresh is idempotent — no harm in pulling fresh data either way.
 */
function needsParsRefresh(holes: CourseHoleDetail[]): boolean {
  if (holes.length === 0) return true;
  return holes.every((h) => h.par === 4);
}
