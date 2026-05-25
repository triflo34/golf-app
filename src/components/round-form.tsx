"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Course, User } from "@/lib/types";
import type { CourseSearchResult } from "@/app/api/courses/search/route";

export type PlayerEntry =
  | { kind: "user"; user: User; gross: string }
  | { kind: "guest"; name: string; gross: string };

export type RoundFormInitial = {
  courseId: number | null;
  playedAt: string;
  notes: string;
  holeCount: 9 | 18;
  players: PlayerEntry[];
};

export type RoundFormPayload = {
  course_id: number;
  played_at: string;
  notes: string | null;
  hole_count: 9 | 18;
  scores: Array<
    | { player_id: string; gross_score: number }
    | { guest_name: string; gross_score: number }
  >;
};

type Variant = "classic" | "v2";

type Props = {
  initial: RoundFormInitial;
  submitLabel: string;
  onSubmit: (payload: RoundFormPayload) => Promise<void>;
  variant?: Variant;
};

// All variant-specific class strings collected in one place so the JSX below
// stays readable while still supporting the classic light theme and the new
// v2 dark theme via the same component.
function styles(variant: Variant) {
  const v2 = variant === "v2";
  return {
    errorBox: v2
      ? "mb-4 rounded-lg bg-red-950/60 p-3 text-sm text-red-300"
      : "mb-4 bg-red-50 text-red-600 text-sm p-3 rounded-lg",
    card: v2
      ? "mb-4 rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-4"
      : "card mb-4",
    label: v2
      ? "block text-sm font-medium text-[var(--v2-muted)] mb-1"
      : "block text-sm font-medium text-gray-700 mb-1",
    input: v2
      ? "w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-white placeholder-[var(--v2-muted)] focus:border-[var(--v2-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--v2-accent)]/40"
      : "w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900",
    selectedCourseBox: v2
      ? "flex items-center justify-between rounded-lg bg-[var(--v2-surface-2)] px-3 py-2"
      : "flex items-center justify-between bg-green-50 rounded-lg px-3 py-2",
    selectedCourseTitle: v2 ? "font-semibold text-white" : "font-semibold text-gray-800",
    selectedCourseMeta: v2 ? "text-xs text-[var(--v2-muted)]" : "text-xs text-gray-500",
    changeLink: v2
      ? "text-sm font-medium text-[var(--v2-accent)]"
      : "text-sm text-green-700 font-medium",
    pickerWrap: v2
      ? "mt-2 max-h-72 overflow-y-auto rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)]"
      : "mt-2 max-h-72 overflow-y-auto border border-gray-200 rounded-lg",
    pickerEmpty: v2
      ? "p-3 text-sm text-[var(--v2-muted)]"
      : "p-3 text-sm text-gray-400",
    pickerRow: v2
      ? "w-full px-3 py-2 text-left hover:bg-[var(--v2-surface)] border-b border-[var(--v2-border)] last:border-b-0 disabled:opacity-50"
      : "w-full text-left px-3 py-2 hover:bg-green-50 border-b border-gray-100 last:border-b-0 disabled:opacity-50",
    pickerRowExternal: v2
      ? "w-full px-3 py-2 text-left hover:bg-[var(--v2-surface)] border-b border-[var(--v2-border)] last:border-b-0 disabled:opacity-50"
      : "w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 disabled:opacity-50",
    pickerRowGuest: v2
      ? "w-full px-3 py-2 text-left hover:bg-[var(--v2-accent)]/10 bg-[var(--v2-accent)]/5"
      : "w-full text-left px-3 py-2 hover:bg-yellow-50 bg-yellow-50/50",
    pickerName: v2 ? "text-sm font-semibold text-white" : "text-sm font-semibold text-gray-800",
    pickerMeta: v2 ? "text-xs text-[var(--v2-muted)]" : "text-xs text-gray-500",
    badgeSaved: v2
      ? "text-[10px] px-1.5 py-0.5 rounded bg-[var(--v2-score)]/20 text-[var(--v2-score-soft)] shrink-0"
      : "text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800 shrink-0",
    badgeImport: v2
      ? "text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 shrink-0"
      : "text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 shrink-0",
    sectionHeader: v2 ? "font-semibold text-white" : "font-semibold text-gray-800",
    smallMuted: v2 ? "text-xs text-[var(--v2-muted)]" : "text-xs text-gray-500",
    holeBtnActive: v2
      ? "px-4 py-1.5 text-sm font-medium bg-[var(--v2-accent)] text-black"
      : "px-4 py-1.5 text-sm font-medium bg-green-700 text-white",
    holeBtnIdle: v2
      ? "px-4 py-1.5 text-sm font-medium bg-[var(--v2-surface-2)] text-[var(--v2-muted)] hover:bg-[var(--v2-border)]"
      : "px-4 py-1.5 text-sm font-medium bg-white text-gray-700 hover:bg-gray-50",
    holeWrap: v2
      ? "inline-flex rounded-lg border border-[var(--v2-border)] overflow-hidden"
      : "inline-flex rounded-lg border border-gray-300 overflow-hidden",
    apiSearchingNote: v2
      ? "px-3 py-2 text-xs text-[var(--v2-muted)]"
      : "px-3 py-2 text-xs text-gray-500",
    rateLimited: v2
      ? "px-3 py-2 text-xs text-orange-300 bg-orange-950/40 border-t border-orange-800"
      : "px-3 py-2 text-xs text-orange-800 bg-orange-50 border-t border-orange-200",
    apiError: v2
      ? "px-3 py-2 text-xs text-amber-300 bg-amber-950/40 border-t border-amber-800"
      : "px-3 py-2 text-xs text-amber-800 bg-amber-50 border-t border-amber-200",
    apiHitsHeader: v2
      ? "px-3 py-1 text-[10px] uppercase tracking-wide text-[var(--v2-muted)] bg-[var(--v2-surface)] border-t border-b border-[var(--v2-border)]"
      : "px-3 py-1 text-[10px] uppercase tracking-wide text-gray-400 bg-gray-50 border-t border-b border-gray-100",
    scoreInput: v2
      ? "w-20 px-2 py-1.5 rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] text-white text-center"
      : "w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-gray-900 text-center",
    playerName: v2 ? "text-sm font-semibold text-white truncate" : "text-sm font-semibold text-gray-800 truncate",
    playerSub: v2 ? "text-xs text-[var(--v2-muted)]" : "text-xs text-gray-500",
    removeBtn: v2
      ? "text-red-400 text-xs font-medium px-2"
      : "text-red-500 text-xs font-medium px-2",
    submitBtn: v2
      ? "w-full py-3 rounded-lg bg-[var(--v2-accent)] font-semibold text-black hover:bg-[var(--v2-accent-soft)] disabled:opacity-50 transition"
      : "w-full py-3 bg-green-700 text-white font-medium rounded-lg hover:bg-green-800 disabled:opacity-50 transition",
  };
}

export function RoundForm({
  initial,
  submitLabel,
  onSubmit,
  variant = "classic",
}: Props) {
  const cls = styles(variant);
  const [courses, setCourses] = useState<Course[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [courseId, setCourseId] = useState<number | null>(initial.courseId);
  const [courseQuery, setCourseQuery] = useState("");
  const [showCoursePicker, setShowCoursePicker] = useState(false);
  const [apiHits, setApiHits] = useState<CourseSearchResult[]>([]);
  const [apiSearching, setApiSearching] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiRateLimited, setApiRateLimited] = useState(false);
  const [importingExtId, setImportingExtId] = useState<string | null>(null);
  const apiSeqRef = useRef(0);

  const [playedAt, setPlayedAt] = useState(initial.playedAt);
  const [holeCount, setHoleCount] = useState<9 | 18>(initial.holeCount);
  const [holeCountTouched, setHoleCountTouched] = useState(false);
  const [players, setPlayers] = useState<PlayerEntry[]>(initial.players);
  const [playerQuery, setPlayerQuery] = useState("");
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);

  const [notes, setNotes] = useState(initial.notes);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  // When the user picks a course, default hole_count from the course unless they've overridden.
  useEffect(() => {
    if (holeCountTouched) return;
    if (!selectedCourse) return;
    const courseHoles = selectedCourse.holes === 9 ? 9 : 18;
    setHoleCount(courseHoles);
  }, [selectedCourse, holeCountTouched]);

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

  // Debounced GolfCourseAPI search — runs only when picker is open and query
  // has at least 2 chars. Surfaces external hits below local matches so a
  // brand-new course can be imported without leaving the round form.
  useEffect(() => {
    if (!showCoursePicker || courseId != null) {
      setApiHits([]);
      setApiError(null);
      return;
    }
    const q = courseQuery.trim();
    if (q.length < 2) {
      setApiHits([]);
      setApiError(null);
      return;
    }
    const handle = setTimeout(async () => {
      const seq = ++apiSeqRef.current;
      setApiSearching(true);
      try {
        const res = await fetch(`/api/courses/search?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (seq !== apiSeqRef.current) return;
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        // Only external hits — local ones are already in `filteredCourses`.
        const hits: CourseSearchResult[] = (data.results ?? []).filter(
          (r: CourseSearchResult) => r.source === "external",
        );
        setApiHits(hits);
        setApiError(data.external_error ?? null);
        setApiRateLimited(Boolean(data.rate_limited));
      } catch (e) {
        if (seq !== apiSeqRef.current) return;
        setApiError(e instanceof Error ? e.message : "Search failed");
        setApiHits([]);
      } finally {
        if (seq === apiSeqRef.current) setApiSearching(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [courseQuery, showCoursePicker, courseId]);

  async function importAndSelect(externalId: string) {
    setImportingExtId(externalId);
    setApiError(null);
    try {
      const res = await fetch("/api/courses/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ external_id: externalId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Import failed");
      // Pull the now-existing local course so it's in the picker list and
      // selectedCourse renders properly.
      const courseRes = await fetch(`/api/courses/${body.id}`, { cache: "no-store" });
      if (courseRes.ok) {
        const data = await courseRes.json();
        if (data?.course) {
          setCourses((prev) =>
            prev.some((c) => c.id === data.course.id)
              ? prev
              : [...prev, data.course],
          );
        }
      }
      setCourseId(body.id);
      setCourseQuery("");
      setShowCoursePicker(false);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImportingExtId(null);
    }
  }

  const takenUserIds = new Set(
    players
      .filter((p) => p.kind === "user")
      .map((p) => (p as { user: User }).user.id),
  );
  const filteredUsers = useMemo(() => {
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
  }, [users, playerQuery, takenUserIds]);

  function addUserPlayer(u: User) {
    if (players.length >= 8) return;
    setPlayers((arr) => [...arr, { kind: "user", user: u, gross: "" }]);
    setPlayerQuery("");
    setShowPlayerPicker(false);
  }

  function addGuestPlayer() {
    const name = playerQuery.trim();
    if (!name || players.length >= 8) return;
    const takenGuestKeys = new Set(
      players
        .filter((p) => p.kind === "guest")
        .map((p) => (p as { name: string }).name.toLowerCase()),
    );
    if (takenGuestKeys.has(name.toLowerCase())) {
      setError("Guest name already added to this round");
      return;
    }
    setError("");
    setPlayers((arr) => [...arr, { kind: "guest", name, gross: "" }]);
    setPlayerQuery("");
    setShowPlayerPicker(false);
  }

  function removePlayer(i: number) {
    setPlayers((arr) => arr.filter((_, idx) => idx !== i));
  }

  function setPlayerScore(i: number, v: string) {
    setPlayers((arr) =>
      arr.map((p, idx) => (idx === i ? { ...p, gross: v } : p)),
    );
  }

  async function submit() {
    setError("");
    if (!courseId) return setError("Pick a course");
    if (!playedAt) return setError("Pick a date");
    if (players.length === 0) return setError("Add at least one player");

    const minScore = holeCount === 9 ? 9 : 18;
    const scores: RoundFormPayload["scores"] = [];
    for (const p of players) {
      const gross = Number(p.gross);
      if (!Number.isFinite(gross) || gross < minScore || gross > 200) {
        return setError(
          `Score must be ${minScore}–200 for ${p.kind === "user" ? p.user.display_name : p.name}`,
        );
      }
      scores.push(
        p.kind === "user"
          ? { player_id: p.user.id, gross_score: gross }
          : { guest_name: p.name, gross_score: gross },
      );
    }

    try {
      setSubmitting(true);
      await onSubmit({
        course_id: courseId,
        played_at: playedAt,
        notes: notes.trim() || null,
        hole_count: holeCount,
        scores,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSubmitting(false);
    }
  }

  return (
    <>
      {error && <div className={cls.errorBox}>{error}</div>}

      <div className={cls.card}>
        <label className={cls.label}>Course</label>
        {selectedCourse ? (
          <div className={cls.selectedCourseBox}>
            <div>
              <div className={cls.selectedCourseTitle}>
                {selectedCourse.name}
              </div>
              <div className={cls.selectedCourseMeta}>
                {selectedCourse.city} · par {selectedCourse.par} ·{" "}
                {selectedCourse.holes} holes
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setCourseId(null);
                setShowCoursePicker(true);
              }}
              className={cls.changeLink}
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={courseQuery}
              onFocus={() => setShowCoursePicker(true)}
              onChange={(e) => {
                setCourseQuery(e.target.value);
                setShowCoursePicker(true);
              }}
              placeholder="Search by name or city…"
              className={cls.input}
            />
            {showCoursePicker && (
              <div className={cls.pickerWrap}>
                {filteredCourses.length === 0 &&
                apiHits.length === 0 &&
                !apiSearching ? (
                  <div className={cls.pickerEmpty}>
                    {courseQuery.trim().length < 2
                      ? "Type at least 2 characters to search the GolfCourseAPI."
                      : "No courses match."}
                  </div>
                ) : (
                  <>
                    {filteredCourses.map((c) => (
                      <button
                        key={`L${c.id}`}
                        type="button"
                        onClick={() => {
                          setCourseId(c.id);
                          setCourseQuery("");
                          setShowCoursePicker(false);
                        }}
                        className={cls.pickerRow}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`${cls.pickerName} truncate`}>
                            {c.name}
                          </span>
                          <span className={cls.badgeSaved}>saved</span>
                        </div>
                        <div className={cls.pickerMeta}>
                          {c.city} · par {c.par}
                        </div>
                      </button>
                    ))}
                    {apiHits.length > 0 && filteredCourses.length > 0 && (
                      <div className={cls.apiHitsHeader}>From GolfCourseAPI</div>
                    )}
                    {apiHits.map((r) => {
                      if (r.source !== "external") return null;
                      const importing = importingExtId === r.external_id;
                      return (
                        <button
                          key={`E${r.external_id}`}
                          type="button"
                          disabled={Boolean(importingExtId)}
                          onClick={() => importAndSelect(r.external_id)}
                          className={cls.pickerRowExternal}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`${cls.pickerName} truncate`}>
                              {r.name}
                            </span>
                            <span className={cls.badgeImport}>import</span>
                          </div>
                          <div className={`${cls.pickerMeta} truncate`}>
                            {[r.city, r.state, r.country]
                              .filter(Boolean)
                              .join(", ") || "—"}
                          </div>
                          {importing && (
                            <div className="mt-0.5 text-[10px] text-blue-300">
                              Importing…
                            </div>
                          )}
                        </button>
                      );
                    })}
                    {apiSearching && (
                      <div className={cls.apiSearchingNote}>
                        Searching GolfCourseAPI…
                      </div>
                    )}
                  </>
                )}
                {apiRateLimited ? (
                  <div className={cls.rateLimited}>
                    ⏱ Daily GolfCourseAPI limit reached. Saved courses still
                    work; new searches resume tomorrow.
                  </div>
                ) : apiError ? (
                  <div className={cls.apiError}>{apiError}</div>
                ) : null}
              </div>
            )}
          </>
        )}

        <label className={`${cls.label} mt-4`}>Date</label>
        <input
          type="date"
          value={playedAt}
          onChange={(e) => setPlayedAt(e.target.value)}
          className={`${cls.input} min-w-0`}
        />

        <label className={`${cls.label} mt-4`}>Holes</label>
        <div className={cls.holeWrap}>
          {[9, 18].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setHoleCount(n as 9 | 18);
                setHoleCountTouched(true);
              }}
              className={holeCount === n ? cls.holeBtnActive : cls.holeBtnIdle}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className={cls.card}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className={cls.sectionHeader}>Players &amp; Scores</h2>
          <span className={cls.smallMuted}>{players.length}/8</span>
        </div>

        <div className="mb-3 space-y-2">
          {players.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className={cls.playerName}>
                  {p.kind === "user" ? p.user.display_name : p.name}
                </div>
                <div className={cls.playerSub}>
                  {p.kind === "user" ? `@${p.user.username}` : "guest"}
                </div>
              </div>
              <input
                type="number"
                inputMode="numeric"
                min={holeCount === 9 ? 9 : 18}
                max={200}
                placeholder="Score"
                value={p.gross}
                onChange={(e) => setPlayerScore(i, e.target.value)}
                className={cls.scoreInput}
              />
              <button
                type="button"
                onClick={() => removePlayer(i)}
                className={cls.removeBtn}
                aria-label="Remove player"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {players.length < 8 && (
          <>
            <input
              type="text"
              value={playerQuery}
              onFocus={() => setShowPlayerPicker(true)}
              onChange={(e) => {
                setPlayerQuery(e.target.value);
                setShowPlayerPicker(true);
              }}
              placeholder="Add player by name…"
              className={cls.input}
            />
            {showPlayerPicker && (
              <div className={cls.pickerWrap}>
                {filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => addUserPlayer(u)}
                    className={cls.pickerRow}
                  >
                    <div className={cls.pickerName}>{u.display_name}</div>
                    <div className={cls.pickerMeta}>@{u.username}</div>
                  </button>
                ))}
                {playerQuery.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={addGuestPlayer}
                    className={cls.pickerRowGuest}
                  >
                    <div className={cls.pickerName}>
                      Add &quot;{playerQuery.trim()}&quot; as guest
                    </div>
                    <div className={cls.pickerMeta}>no account needed</div>
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className={cls.card}>
        <label className={cls.label}>
          Notes{" "}
          <span
            className={
              variant === "v2"
                ? "font-normal text-[var(--v2-muted)]/70"
                : "font-normal text-gray-400"
            }
          >
            (optional)
          </span>
        </label>
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
        disabled={submitting}
        className={cls.submitBtn}
      >
        {submitting ? "Saving..." : submitLabel}
      </button>
    </>
  );
}
