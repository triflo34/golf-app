"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Course, User } from "@/lib/types";

type Variant = "classic" | "v2";

type RosterEntry =
  | { kind: "user"; user: User }
  | { kind: "guest"; name: string };

type Props = {
  me: User;
  variant?: Variant;
};

function styles(variant: Variant) {
  const v2 = variant === "v2";
  return {
    card: v2
      ? "mb-4 rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-4"
      : "card mb-4",
    label: v2
      ? "block text-sm font-medium text-[var(--v2-muted)] mb-1"
      : "block text-sm font-medium text-gray-700 mb-1",
    input: v2
      ? "w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-white focus:border-[var(--v2-accent)] focus:outline-none"
      : "w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900",
    selectedBox: v2
      ? "flex items-center justify-between rounded-lg bg-[var(--v2-surface-2)] px-3 py-2"
      : "flex items-center justify-between bg-green-50 rounded-lg px-3 py-2",
    selectedTitle: v2 ? "font-semibold text-white" : "font-semibold text-gray-800",
    selectedMeta: v2 ? "text-xs text-[var(--v2-muted)]" : "text-xs text-gray-500",
    changeLink: v2
      ? "text-sm font-medium text-[var(--v2-accent)]"
      : "text-sm text-green-700 font-medium",
    picker: v2
      ? "mt-2 max-h-72 overflow-y-auto rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)]"
      : "mt-2 max-h-72 overflow-y-auto border border-gray-200 rounded-lg",
    pickerRow: v2
      ? "w-full px-3 py-2 text-left hover:bg-[var(--v2-surface)] border-b border-[var(--v2-border)] last:border-b-0"
      : "w-full text-left px-3 py-2 hover:bg-green-50 border-b border-gray-100 last:border-b-0",
    pickerRowGuest: v2
      ? "w-full px-3 py-2 text-left hover:bg-[var(--v2-accent)]/10 bg-[var(--v2-accent)]/5"
      : "w-full text-left px-3 py-2 hover:bg-yellow-50 bg-yellow-50/50",
    pickerName: v2 ? "text-sm font-semibold text-white" : "text-sm font-semibold text-gray-800",
    pickerMeta: v2 ? "text-xs text-[var(--v2-muted)]" : "text-xs text-gray-500",
    sectionHeader: v2 ? "font-semibold text-white" : "font-semibold text-gray-800",
    smallMuted: v2 ? "text-xs text-[var(--v2-muted)]" : "text-xs text-gray-500",
    chip: v2
      ? "flex items-center justify-between rounded-lg bg-[var(--v2-surface-2)] px-3 py-2"
      : "flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2",
    chipName: v2 ? "text-sm font-medium text-white" : "text-sm font-medium text-gray-800",
    removeBtn: v2
      ? "text-red-400 text-xs font-medium px-2"
      : "text-red-500 text-xs font-medium px-2",
    holeBtnActive: v2
      ? "px-4 py-1.5 text-sm font-medium bg-[var(--v2-accent)] text-black"
      : "px-4 py-1.5 text-sm font-medium bg-green-700 text-white",
    holeBtnIdle: v2
      ? "px-4 py-1.5 text-sm font-medium bg-[var(--v2-surface-2)] text-[var(--v2-muted)] hover:bg-[var(--v2-border)]"
      : "px-4 py-1.5 text-sm font-medium bg-white text-gray-700 hover:bg-gray-50",
    holeWrap: v2
      ? "inline-flex rounded-lg border border-[var(--v2-border)] overflow-hidden"
      : "inline-flex rounded-lg border border-gray-300 overflow-hidden",
    submitBtn: v2
      ? "w-full py-3 rounded-lg bg-[var(--v2-accent)] font-semibold text-black hover:bg-[var(--v2-accent-soft)] disabled:opacity-50 transition"
      : "w-full py-3 bg-green-700 text-white font-medium rounded-lg hover:bg-green-800 disabled:opacity-50 transition",
    errorBox: v2
      ? "mb-4 rounded-lg bg-red-950/60 p-3 text-sm text-red-300"
      : "mb-4 bg-red-50 text-red-600 text-sm p-3 rounded-lg",
  };
}

export function LiveRoundSetup({ me, variant = "classic" }: Props) {
  const cls = styles(variant);
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [courseQuery, setCourseQuery] = useState("");
  const [showCoursePicker, setShowCoursePicker] = useState(false);
  const [playedAt, setPlayedAt] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [holeCount, setHoleCount] = useState<9 | 18>(18);
  const [holeCountTouched, setHoleCountTouched] = useState(false);
  const [ninePlayed, setNinePlayed] = useState<"front" | "back">("front");
  const [roster, setRoster] = useState<RosterEntry[]>([
    { kind: "user", user: me },
  ]);
  const [playerQuery, setPlayerQuery] = useState("");
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [notes, setNotes] = useState("");
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

  useEffect(() => {
    if (holeCountTouched) return;
    if (!selectedCourse) return;
    setHoleCount(selectedCourse.holes === 9 ? 9 : 18);
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

  const takenUserIds = new Set(
    roster.filter((p) => p.kind === "user").map((p) => p.user.id),
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

  function addUser(u: User) {
    if (roster.length >= 8) return;
    setRoster((arr) => [...arr, { kind: "user", user: u }]);
    setPlayerQuery("");
    setShowPlayerPicker(false);
  }

  function addGuest() {
    const name = playerQuery.trim();
    if (!name || roster.length >= 8) return;
    const takenGuests = new Set(
      roster.filter((p) => p.kind === "guest").map((p) => p.name.toLowerCase()),
    );
    if (takenGuests.has(name.toLowerCase())) {
      setError("Guest name already added");
      return;
    }
    setError("");
    setRoster((arr) => [...arr, { kind: "guest", name }]);
    setPlayerQuery("");
    setShowPlayerPicker(false);
  }

  function removeAt(idx: number) {
    setRoster((arr) => arr.filter((_, i) => i !== idx));
  }

  async function handleStart() {
    setError("");
    if (!courseId) return setError("Pick a course");
    if (roster.length === 0) return setError("Add at least one player");
    setSubmitting(true);
    try {
      const payload = {
        course_id: courseId,
        played_at: playedAt,
        hole_count: holeCount,
        nine_played: holeCount === 9 ? ninePlayed : null,
        notes: notes.trim() || null,
        players: roster.map((r) =>
          r.kind === "user" ? { player_id: r.user.id } : { guest_name: r.name },
        ),
      };
      const res = await fetch("/api/rounds/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to start round");
      router.push(`/rounds/live/${body.round_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start round");
      setSubmitting(false);
    }
  }

  const guestQueryHasName = playerQuery.trim().length > 0;
  const guestPreview = playerQuery.trim();
  const showGuestAddRow =
    showPlayerPicker &&
    guestQueryHasName &&
    !filteredUsers.some(
      (u) =>
        u.display_name.toLowerCase() === guestPreview.toLowerCase() ||
        u.username.toLowerCase() === guestPreview.toLowerCase(),
    );

  return (
    <div>
      {error && <div className={cls.errorBox}>{error}</div>}

      <div className={cls.card}>
        <label className={cls.label}>Course</label>
        {selectedCourse ? (
          <div className={cls.selectedBox}>
            <div>
              <div className={cls.selectedTitle}>{selectedCourse.name}</div>
              <div className={cls.selectedMeta}>
                {selectedCourse.city}, {selectedCourse.state} · Par{" "}
                {selectedCourse.par} · {selectedCourse.holes} holes
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
              placeholder="Search courses"
              value={courseQuery}
              onChange={(e) => setCourseQuery(e.target.value)}
              onFocus={() => setShowCoursePicker(true)}
              className={cls.input}
            />
            {showCoursePicker && (
              <div className={cls.picker}>
                {filteredCourses.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCourseId(c.id);
                      setCourseQuery("");
                      setShowCoursePicker(false);
                    }}
                    className={cls.pickerRow}
                  >
                    <div className={cls.pickerName}>{c.name}</div>
                    <div className={cls.pickerMeta}>
                      {c.city} · Par {c.par} · {c.holes} holes
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className={cls.card}>
        <label className={cls.label}>Date</label>
        <input
          type="date"
          value={playedAt}
          onChange={(e) => setPlayedAt(e.target.value)}
          className={cls.input}
        />
        <div className="mt-3">
          <label className={cls.label}>Holes</label>
          <div className={cls.holeWrap}>
            <button
              type="button"
              onClick={() => {
                setHoleCount(18);
                setHoleCountTouched(true);
              }}
              className={holeCount === 18 ? cls.holeBtnActive : cls.holeBtnIdle}
            >
              18
            </button>
            <button
              type="button"
              onClick={() => {
                setHoleCount(9);
                setHoleCountTouched(true);
              }}
              className={holeCount === 9 ? cls.holeBtnActive : cls.holeBtnIdle}
            >
              9
            </button>
          </div>
        </div>
        {holeCount === 9 && (
          <div className="mt-3">
            <label className={cls.label}>Which nine</label>
            <div className={cls.holeWrap}>
              <button
                type="button"
                onClick={() => setNinePlayed("front")}
                className={
                  ninePlayed === "front" ? cls.holeBtnActive : cls.holeBtnIdle
                }
              >
                Front
              </button>
              <button
                type="button"
                onClick={() => setNinePlayed("back")}
                className={
                  ninePlayed === "back" ? cls.holeBtnActive : cls.holeBtnIdle
                }
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>

      <div className={cls.card}>
        <div className="flex items-center justify-between mb-2">
          <span className={cls.sectionHeader}>Players</span>
          <span className={cls.smallMuted}>{roster.length}/8</span>
        </div>
        <div className="space-y-2">
          {roster.map((p, i) => (
            <div key={`${p.kind}-${i}`} className={cls.chip}>
              <div>
                <div className={cls.chipName}>
                  {p.kind === "user" ? p.user.display_name : p.name}
                </div>
                {p.kind === "user" ? (
                  <div className={cls.pickerMeta}>@{p.user.username}</div>
                ) : (
                  <div className={cls.pickerMeta}>Guest</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeAt(i)}
                className={cls.removeBtn}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {roster.length < 8 && (
          <div className="mt-3">
            <input
              type="text"
              placeholder="Add player or guest name"
              value={playerQuery}
              onChange={(e) => setPlayerQuery(e.target.value)}
              onFocus={() => setShowPlayerPicker(true)}
              className={cls.input}
            />
            {showPlayerPicker && (
              <div className={cls.picker}>
                {filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => addUser(u)}
                    className={cls.pickerRow}
                  >
                    <div className={cls.pickerName}>{u.display_name}</div>
                    <div className={cls.pickerMeta}>@{u.username}</div>
                  </button>
                ))}
                {showGuestAddRow && (
                  <button
                    type="button"
                    onClick={addGuest}
                    className={cls.pickerRowGuest}
                  >
                    <div className={cls.pickerName}>Add &quot;{guestPreview}&quot; as guest</div>
                    <div className={cls.pickerMeta}>
                      Guests can be scored without an account
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className={cls.card}>
        <label className={cls.label}>Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={cls.input}
          placeholder="Weather, conditions, anything memorable"
        />
      </div>

      <button
        type="button"
        onClick={handleStart}
        disabled={submitting}
        className={cls.submitBtn}
      >
        {submitting ? "Starting…" : "Start Live Round"}
      </button>
    </div>
  );
}
