"use client";

import { useEffect, useMemo, useState } from "react";
import type { Course, User } from "@/lib/types";

export type PlayerEntry =
  | { kind: "user"; user: User; gross: string }
  | { kind: "guest"; name: string; gross: string };

export type RoundFormInitial = {
  courseId: number | null;
  playedAt: string;
  notes: string;
  players: PlayerEntry[];
};

export type RoundFormPayload = {
  course_id: number;
  played_at: string;
  notes: string | null;
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

  const [playedAt, setPlayedAt] = useState(initial.playedAt);
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

    const scores: RoundFormPayload["scores"] = [];
    for (const p of players) {
      const gross = Number(p.gross);
      if (!Number.isFinite(gross) || gross < 18 || gross > 200) {
        return setError(
          `Score must be 18–200 for ${p.kind === "user" ? p.user.display_name : p.name}`,
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
              <div className="mt-2 max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                {filteredCourses.length === 0 ? (
                  <div className="p-3 text-sm text-gray-400">No courses match</div>
                ) : (
                  filteredCourses.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCourseId(c.id);
                        setCourseQuery("");
                        setShowCoursePicker(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-green-50 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="text-sm font-semibold text-gray-800">
                        {c.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {c.city} · par {c.par}
                      </div>
                    </button>
                  ))
                )}
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
                min={18}
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
