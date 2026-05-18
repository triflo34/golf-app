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

type Props = {
  initial: RoundFormInitial;
  submitLabel: string;
  onSubmit: (payload: RoundFormPayload) => Promise<void>;
};

export function RoundForm({ initial, submitLabel, onSubmit }: Props) {
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
      {error && (
        <div className="mb-4 bg-red-50 text-red-600 text-sm p-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="card mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Course
        </label>
        {selectedCourse ? (
          <div className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2">
            <div>
              <div className="font-semibold text-gray-800">
                {selectedCourse.name}
              </div>
              <div className="text-xs text-gray-500">
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
              className="text-sm text-green-700 font-medium"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
            />
            {showCoursePicker && (
              <div className="mt-2 max-h-72 overflow-y-auto border border-gray-200 rounded-lg">
                {filteredCourses.length === 0 && apiHits.length === 0 && !apiSearching ? (
                  <div className="p-3 text-sm text-gray-400">
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
                        className="w-full text-left px-3 py-2 hover:bg-green-50 border-b border-gray-100 last:border-b-0"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-gray-800 truncate">
                            {c.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800 shrink-0">
                            saved
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {c.city} · par {c.par}
                        </div>
                      </button>
                    ))}
                    {apiHits.length > 0 && filteredCourses.length > 0 && (
                      <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-400 bg-gray-50 border-t border-b border-gray-100">
                        From GolfCourseAPI
                      </div>
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
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 disabled:opacity-50"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-gray-800 truncate">
                              {r.name}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 shrink-0">
                              import
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 truncate">
                            {[r.city, r.state, r.country].filter(Boolean).join(", ") || "—"}
                          </div>
                          {importing && (
                            <div className="text-[10px] text-blue-700 mt-0.5">
                              Importing…
                            </div>
                          )}
                        </button>
                      );
                    })}
                    {apiSearching && (
                      <div className="px-3 py-2 text-xs text-gray-500">
                        Searching GolfCourseAPI…
                      </div>
                    )}
                  </>
                )}
                {apiRateLimited ? (
                  <div className="px-3 py-2 text-xs text-orange-800 bg-orange-50 border-t border-orange-200">
                    ⏱ Daily GolfCourseAPI limit reached. Saved courses still
                    work; new searches resume tomorrow.
                  </div>
                ) : apiError ? (
                  <div className="px-3 py-2 text-xs text-amber-800 bg-amber-50 border-t border-amber-200">
                    {apiError}
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}

        <label className="block text-sm font-medium text-gray-700 mt-4 mb-1">
          Date
        </label>
        <input
          type="date"
          value={playedAt}
          onChange={(e) => setPlayedAt(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
        />

        <label className="block text-sm font-medium text-gray-700 mt-4 mb-1">
          Holes
        </label>
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
          {[9, 18].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setHoleCount(n as 9 | 18);
                setHoleCountTouched(true);
              }}
              className={`px-4 py-1.5 text-sm font-medium ${
                holeCount === n
                  ? "bg-green-700 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="card mb-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-semibold text-gray-800">Players & Scores</h2>
          <span className="text-xs text-gray-500">{players.length}/8</span>
        </div>

        <div className="space-y-2 mb-3">
          {players.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-800 truncate">
                  {p.kind === "user" ? p.user.display_name : p.name}
                </div>
                <div className="text-xs text-gray-500">
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
                className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-gray-900 text-center"
              />
              <button
                type="button"
                onClick={() => removePlayer(i)}
                className="text-red-500 text-xs font-medium px-2"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
            />
            {showPlayerPicker && (
              <div className="mt-2 max-h-52 overflow-y-auto border border-gray-200 rounded-lg">
                {filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => addUserPlayer(u)}
                    className="w-full text-left px-3 py-2 hover:bg-green-50 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="text-sm font-semibold text-gray-800">
                      {u.display_name}
                    </div>
                    <div className="text-xs text-gray-500">@{u.username}</div>
                  </button>
                ))}
                {playerQuery.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={addGuestPlayer}
                    className="w-full text-left px-3 py-2 hover:bg-yellow-50 bg-yellow-50/50"
                  >
                    <div className="text-sm font-semibold text-gray-800">
                      Add &quot;{playerQuery.trim()}&quot; as guest
                    </div>
                    <div className="text-xs text-gray-500">no account needed</div>
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="card mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
        />
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="w-full py-3 bg-green-700 text-white font-medium rounded-lg hover:bg-green-800 disabled:opacity-50 transition"
      >
        {submitting ? "Saving..." : submitLabel}
      </button>
    </>
  );
}
