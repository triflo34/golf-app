"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import type { Course } from "@/lib/types";

export function ClassicNewEvent() {
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-green-700 text-lg">Loading...</div>
      </div>
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
    <div className="max-w-lg mx-auto px-4 py-6 pb-24">
      <h1 className="text-2xl font-bold text-green-800 mb-4">New event</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="block text-sm font-medium text-gray-700">Event name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Memorial Weekend Golfapalooza"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-base"
            maxLength={120}
            required
          />
        </label>

        <div className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">
            Course
          </span>
          {selectedCourse ? (
            <div className="flex items-center justify-between rounded-md bg-green-50 border border-green-200 px-3 py-2">
              <div>
                <div className="font-semibold text-gray-800">
                  {selectedCourse.name}
                </div>
                <div className="text-xs text-gray-500">
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
                className="text-sm text-green-700 font-medium"
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
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-base"
              />
              {showCoursePicker && (
                <div className="mt-2 max-h-72 overflow-y-auto border border-gray-200 rounded-md">
                  {filteredCourses.map((c) => (
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
          <span className="block text-sm font-medium text-gray-700 mb-1">
            Total holes
          </span>
          <div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
            {([9, 18, 36] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTotalHoles(n)}
                className={`px-4 py-1.5 text-sm font-medium ${
                  totalHoles === n
                    ? "bg-green-700 text-white"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {totalHoles === 9 && "1 round, 9 holes, individual stroke play."}
            {totalHoles === 18 && "1 round, 18 holes, individual stroke play."}
            {totalHoles === 36 &&
              "2 rounds: 18 individual + 18 scramble. Optionally play round 2 on a second course."}
          </p>
        </div>

        {totalHoles === 36 && (
          <div className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">
              Round 2 course (optional)
            </span>
            {selectedSecondCourse ? (
              <div className="flex items-center justify-between rounded-md bg-green-50 border border-green-200 px-3 py-2">
                <div>
                  <div className="font-semibold text-gray-800">
                    {selectedSecondCourse.name}
                  </div>
                  <div className="text-xs text-gray-500">
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
                  className="text-sm text-green-700 font-medium"
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
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-base"
                />
                {showSecondCoursePicker && (
                  <div className="mt-2 max-h-72 overflow-y-auto border border-gray-200 rounded-md">
                    {filteredSecondCourses.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSecondCourseId(c.id);
                          setSecondCourseQuery("");
                          setShowSecondCoursePicker(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-green-50 border-b border-gray-100 last:border-b-0"
                      >
                        <div className="text-sm font-semibold text-gray-800">
                          {c.name}
                        </div>
                        <div className="text-xs text-gray-500">
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

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700">Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-base"
              required
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-gray-700">End date</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-base"
              required
            />
          </label>
        </div>

        <label className="block">
          <span className="block text-sm font-medium text-gray-700">Entry fee ($)</span>
          <input
            type="number"
            min="0"
            step="5"
            value={entryFee}
            onChange={(e) => setEntryFee(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-base"
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-gray-700">
            Description / rules (optional)
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-base"
          />
        </label>

        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={excludeFromLeaderboard}
            onChange={(e) => setExcludeFromLeaderboard(e.target.checked)}
            className="mt-1"
          />
          <span className="text-sm text-gray-700">
            Exclude this event from the overall leaderboard and handicap tracking
          </span>
        </label>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-semibold disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create event"}
        </button>
      </form>
    </div>
  );
}
