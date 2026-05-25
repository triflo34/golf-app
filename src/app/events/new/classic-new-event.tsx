"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import type { Course } from "@/lib/types";

export function ClassicNewEvent() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [courses, setCourses] = useState<Course[]>([]);
  const [name, setName] = useState("");
  const [courseId, setCourseId] = useState<number | "">("");
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
    if (typeof courseId !== "number") {
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

        <label className="block">
          <span className="block text-sm font-medium text-gray-700">Course</span>
          <select
            value={courseId === "" ? "" : String(courseId)}
            onChange={(e) => setCourseId(e.target.value ? Number(e.target.value) : "")}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-base"
            required
          >
            <option value="">Select a course…</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.city}
              </option>
            ))}
          </select>
        </label>

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
