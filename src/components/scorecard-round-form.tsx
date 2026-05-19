"use client";

import { useEffect, useMemo, useState } from "react";
import type { Course, User } from "@/lib/types";
import type { CourseHoleDetail } from "@/app/api/courses/[id]/route";
import { ScorecardUploader, type OcrResult } from "@/components/scorecard-uploader";
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

type Props = {
  me: User;
  onSubmit: (payload: ScorecardPayload) => Promise<void>;
};

export function ScorecardRoundForm({ me, onSubmit }: Props) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [courseQuery, setCourseQuery] = useState("");
  const [holeMeta, setHoleMeta] = useState<CourseHoleDetail[]>([]);
  const [holeCount, setHoleCount] = useState<9 | 18>(18);
  const [playedAt, setPlayedAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");
  const [players, setPlayers] = useState<GridPlayer[]>(() => [
    { user: me, strokes: Array.from({ length: 18 }, () => null) },
  ]);
  const [playerQuery, setPlayerQuery] = useState("");
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
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

  // Best-effort prefill: take OCR lines that look like 18 (or 9) numbers and
  // assign them to player rows in order. The user fixes whatever's wrong.
  // In "to_par" mode the parsed numbers are interpreted as diffs from par.
  function applyOcr(result: OcrResult) {
    setOcr(result);
    const candidateLines = result.lines.filter(
      (ln) => ln.numbers.length >= holeCount,
    );
    if (candidateLines.length === 0) return;
    setPlayers((prev) =>
      prev.map((p, idx) => {
        const line = candidateLines[idx];
        if (!line) return p;
        const nums = line.numbers.slice(0, holeCount);
        return {
          ...p,
          strokes: nums.map((n, i) => {
            const par = pars[i] ?? 4;
            const abs = entryMode === "to_par" ? par + n : n;
            return abs >= 1 && abs <= 20 ? abs : null;
          }),
        };
      }),
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
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="card">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Course
        </label>
        {selectedCourse ? (
          <>
            <div className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2">
              <div>
                <div className="font-semibold text-gray-800">
                  {selectedCourse.name}
                </div>
                <div className="text-xs text-gray-500">
                  {selectedCourse.city}, {selectedCourse.state} · par{" "}
                  {selectedCourse.par} · {selectedCourse.holes} holes
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCourseId(null)}
                className="text-xs text-green-700 hover:underline"
              >
                Change
              </button>
            </div>
            {needsParsRefresh(holeMeta) && (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
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
                        className="rounded-md bg-amber-700 text-white px-2.5 py-1 font-medium disabled:opacity-50"
                      >
                        {refreshingCourse
                          ? "Refreshing…"
                          : "Refresh pars from API"}
                      </button>
                      {refreshMessage && (
                        <span className="text-amber-800">{refreshMessage}</span>
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
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <ul className="mt-2 max-h-48 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-md bg-white">
              {filteredCourses.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCourseId(c.id);
                      setCourseQuery("");
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-green-50"
                  >
                    <div className="font-medium text-gray-800">{c.name}</div>
                    <div className="text-xs text-gray-500">
                      {c.city}, {c.state} · {c.holes} holes
                    </div>
                  </button>
                </li>
              ))}
              {filteredCourses.length === 0 && (
                <li className="px-3 py-3 text-xs text-gray-500">
                  No courses match — add one from the Courses tab first.
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      <div className="card grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date played
          </label>
          <input
            type="date"
            value={playedAt}
            onChange={(e) => setPlayedAt(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Holes
          </label>
          <div className="flex bg-gray-100 rounded-md p-0.5 text-xs font-medium">
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
                className={`flex-1 px-2 py-1.5 rounded ${
                  holeCount === h
                    ? "bg-white text-green-700 shadow-sm"
                    : "text-gray-500"
                }`}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Players ({players.length}/8)
        </label>
        <p className="text-xs text-gray-500 mb-2">
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
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
          />
          {showPlayerPicker && filteredUsers.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-md bg-white shadow-sm">
              {filteredUsers.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => addPlayer(u)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-green-50"
                  >
                    <div className="font-medium text-gray-800">
                      {u.display_name}
                    </div>
                    <div className="text-xs text-gray-500">@{u.username}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Scorecard photo (optional)
        </label>
        <ScorecardUploader
          onResult={applyOcr}
          disabled={submitting || !courseId}
        />
        {ocr && (
          <details className="mt-3 text-xs text-gray-500">
            <summary className="cursor-pointer">Raw OCR output</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all bg-gray-50 border border-gray-200 rounded p-2 max-h-40 overflow-y-auto">
              {ocr.rawText}
            </pre>
          </details>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">
            Scores
          </label>
          <div className="flex bg-gray-100 rounded-md p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setEntryMode("strokes")}
              className={`px-2.5 py-1 rounded transition ${
                entryMode === "strokes"
                  ? "bg-white text-green-700 shadow-sm"
                  : "text-gray-500"
              }`}
              title="Type the actual stroke count (4, 5, 6…)"
            >
              Strokes
            </button>
            <button
              type="button"
              onClick={() => setEntryMode("to_par")}
              className={`px-2.5 py-1 rounded transition ${
                entryMode === "to_par"
                  ? "bg-white text-green-700 shadow-sm"
                  : "text-gray-500"
              }`}
              title="Type diff vs par: 0 = par, -1 = birdie, 1 = bogey…"
            >
              vs Par
            </button>
          </div>
        </div>
        {entryMode === "to_par" && (
          <p className="text-[11px] text-gray-500 mb-2">
            <span className="font-medium">0</span> = par,{" "}
            <span className="font-medium">-1</span> = birdie,{" "}
            <span className="font-medium">1</span> = bogey. Saved as actual
            strokes.
          </p>
        )}
        {players.length === 0 ? (
          <p className="text-xs text-gray-500">Add a player above.</p>
        ) : (
          <ScorecardGrid
            holeCount={holeCount}
            pars={pars}
            players={players}
            onChange={setPlayers}
            onRemovePlayer={removePlayer}
            entryMode={entryMode}
          />
        )}
      </div>

      <div className="card">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={submitting || !courseId || players.length === 0}
        className="w-full rounded-md bg-green-700 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Save scorecard"}
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
