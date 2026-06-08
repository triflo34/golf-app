"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { V2PageShell } from "@/components/v2/page-shell";
import type { Course } from "@/lib/types";

const INPUT_CLS =
  "mt-1 w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-base text-[var(--v2-text)] placeholder-[var(--v2-text-dim)] focus:border-[var(--v2-gold)] focus:outline-none focus:ring-2 focus:ring-[var(--v2-gold)]/40";

export function V2NewEvent() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [courses, setCourses] = useState<Course[]>([]);
  const [name, setName] = useState("");
  const [courseId, setCourseId] = useState<number | null>(null);
  const [courseQuery, setCourseQuery] = useState("");
  const [showCoursePicker, setShowCoursePicker] = useState(false);
  const [secondCourseId, setSecondCourseId] = useState<number | null>(null);
  const [secondCourseQuery, setSecondCourseQuery] = useState("");
  const [showSecondCoursePicker, setShowSecondCoursePicker] = useState(false);
  const [totalHoles, setTotalHoles] = useState<9 | 18 | 36>(18);
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [entryFee, setEntryFee] = useState("0");
  const [description, setDescription] = useState("");
  const [excludeFromLeaderboard, setExcludeFromLeaderboard] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/courses", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCourses(d.courses ?? []))
      .catch(() => setCourses([]));
  }, []);

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === courseId) ?? null,
    [courses, courseId],
  );
  const selectedSecondCourse = useMemo(
    () => courses.find((c) => c.id === secondCourseId) ?? null,
    [courses, secondCourseId],
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

  const filteredSecondCourses = useMemo(() => {
    const q = secondCourseQuery.trim().toLowerCase();
    if (!q) return courses.slice(0, 20);
    return courses
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [courses, secondCourseQuery]);

  if (authLoading || !user) {
    return (
      <V2PageShell>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="animate-pulse text-[var(--v2-gold)]">Loading…</div>
        </div>
      </V2PageShell>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required");
      return;
    }
    if (courseId == null) {
      setError("Pick a course");
      return;
    }
    if (endDate < startDate) {
      setError("End date must be on or after start date");
      return;
    }
    const dollars = Number(entryFee);
    if (!Number.isFinite(dollars) || dollars < 0) {
      setError("Entry fee must be a non-negative number");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          course_id: courseId,
          start_date: startDate,
          end_date: endDate,
          entry_fee_cents: Math.round(dollars * 100),
          description: description.trim() || null,
          exclude_from_leaderboard: excludeFromLeaderboard,
          total_holes: totalHoles,
          second_course_id: totalHoles === 36 ? secondCourseId : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Create failed");
      router.push(`/events/${data.event_id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
      setSubmitting(false);
    }
  }

  return (
    <V2PageShell>
      <Link
        href="/events"
        className="text-sm font-medium text-[var(--v2-gold)]"
      >
        ← Events
      </Link>
      <h1
        className="my-4 text-[22px] font-medium text-[var(--v2-gold)]"
        style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
      >
        New event
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="block text-sm font-medium text-[var(--v2-text-dim)]">
            Event name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Memorial Weekend Golfapalooza"
            className={INPUT_CLS}
            maxLength={120}
            required
          />
        </label>

        <div className="block">
          <span className="block text-sm font-medium text-[var(--v2-text-dim)] mb-1">
            Course
          </span>
          {selectedCourse ? (
            <div className="flex items-center justify-between rounded-lg bg-[var(--v2-surface-2)] px-3 py-2 border border-[var(--v2-border)]">
              <div>
                <div className="font-semibold text-[var(--v2-text)]">
                  {selectedCourse.name}
                </div>
                <div className="text-xs text-[var(--v2-text-dim)]">
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
                className="text-sm font-medium text-[var(--v2-gold)]"
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
                className={INPUT_CLS}
              />
              {showCoursePicker && (
                <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)]">
                  {filteredCourses.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCourseId(c.id);
                        setCourseQuery("");
                        setShowCoursePicker(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-[var(--v2-surface)] border-b border-[var(--v2-border)] last:border-b-0"
                    >
                      <div className="text-sm font-semibold text-[var(--v2-text)]">
                        {c.name}
                      </div>
                      <div className="text-xs text-[var(--v2-text-dim)]">
                        {c.city} · Par {c.par} · {c.holes} holes
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="block">
          <span className="block text-sm font-medium text-[var(--v2-text-dim)] mb-1">
            Total holes
          </span>
          <div className="inline-flex rounded-lg border border-[var(--v2-border)] overflow-hidden">
            {([9, 18, 36] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTotalHoles(n)}
                className={`px-4 py-1.5 text-sm font-medium ${
                  totalHoles === n
                    ? "bg-[var(--v2-gold)] text-[var(--v2-green-deep)]"
                    : "bg-[var(--v2-surface-2)] text-[var(--v2-text-dim)] hover:bg-[var(--v2-border)]"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-[var(--v2-text-dim)]">
            {totalHoles === 9 && "1 round, 9 holes, individual stroke play."}
            {totalHoles === 18 && "1 round, 18 holes, individual stroke play."}
            {totalHoles === 36 &&
              "2 rounds: 18 individual + 18 scramble. Optionally play round 2 on a second course."}
          </p>
        </div>

        {totalHoles === 36 && (
          <div className="block">
            <span className="block text-sm font-medium text-[var(--v2-text-dim)] mb-1">
              Round 2 course (optional)
            </span>
            {selectedSecondCourse ? (
              <div className="flex items-center justify-between rounded-lg bg-[var(--v2-surface-2)] px-3 py-2 border border-[var(--v2-border)]">
                <div>
                  <div className="font-semibold text-[var(--v2-text)]">
                    {selectedSecondCourse.name}
                  </div>
                  <div className="text-xs text-[var(--v2-text-dim)]">
                    {selectedSecondCourse.city}, {selectedSecondCourse.state} ·
                    Par {selectedSecondCourse.par} ·{" "}
                    {selectedSecondCourse.holes} holes
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSecondCourseId(null);
                    setShowSecondCoursePicker(true);
                  }}
                  className="text-sm font-medium text-[var(--v2-gold)]"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Same as round 1 — search to pick a different course"
                  value={secondCourseQuery}
                  onChange={(e) => setSecondCourseQuery(e.target.value)}
                  onFocus={() => setShowSecondCoursePicker(true)}
                  className={INPUT_CLS}
                />
                {showSecondCoursePicker && (
                  <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)]">
                    {filteredSecondCourses.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSecondCourseId(c.id);
                          setSecondCourseQuery("");
                          setShowSecondCoursePicker(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-[var(--v2-surface)] border-b border-[var(--v2-border)] last:border-b-0"
                      >
                        <div className="text-sm font-semibold text-[var(--v2-text)]">
                          {c.name}
                        </div>
                        <div className="text-xs text-[var(--v2-text-dim)]">
                          {c.city} · Par {c.par} · {c.holes} holes
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="block text-sm font-medium text-[var(--v2-text-dim)]">
              Start date
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={`${INPUT_CLS} min-w-0`}
              required
            />
          </label>
          <label className="block min-w-0">
            <span className="block text-sm font-medium text-[var(--v2-text-dim)]">
              End date
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={`${INPUT_CLS} min-w-0`}
              required
            />
          </label>
        </div>

        <label className="block">
          <span className="block text-sm font-medium text-[var(--v2-text-dim)]">
            Entry fee ($)
          </span>
          <input
            type="number"
            min="0"
            step="5"
            value={entryFee}
            onChange={(e) => setEntryFee(e.target.value)}
            className={INPUT_CLS}
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-[var(--v2-text-dim)]">
            Description / rules (optional)
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={INPUT_CLS}
          />
        </label>

        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={excludeFromLeaderboard}
            onChange={(e) => setExcludeFromLeaderboard(e.target.checked)}
            className="mt-1 accent-[var(--v2-gold)]"
          />
          <span className="text-sm text-[var(--v2-text)]">
            Exclude this event from the overall leaderboard and handicap
            tracking
          </span>
        </label>

        {error && (
          <div className="rounded-md border border-[var(--v2-danger-border)] bg-[var(--v2-danger-bg)] px-3 py-2 text-sm text-[var(--v2-red-text)]">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-[var(--v2-gold)] px-4 py-3 font-semibold text-[var(--v2-green-deep)] hover:bg-[var(--v2-gold-bright)] disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create event"}
        </button>
      </form>
    </V2PageShell>
  );
}
