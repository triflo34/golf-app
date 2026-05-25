"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { V2PageShell } from "@/components/v2/page-shell";
import type { Course } from "@/lib/types";

const INPUT_CLS =
  "mt-1 w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-base text-white placeholder-[var(--v2-muted)] focus:border-[var(--v2-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--v2-accent)]/40";

export function V2NewEvent() {
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
      <V2PageShell>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="animate-pulse text-[var(--v2-accent)]">Loading…</div>
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
    <V2PageShell>
      <Link
        href="/events"
        className="text-sm font-medium text-[var(--v2-accent)]"
      >
        ← Events
      </Link>
      <h1 className="my-4 text-2xl font-bold text-[var(--v2-accent)]">
        New event
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="block text-sm font-medium text-[var(--v2-muted)]">
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

        <label className="block">
          <span className="block text-sm font-medium text-[var(--v2-muted)]">
            Course
          </span>
          <select
            value={courseId === "" ? "" : String(courseId)}
            onChange={(e) =>
              setCourseId(e.target.value ? Number(e.target.value) : "")
            }
            className={INPUT_CLS}
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="block text-sm font-medium text-[var(--v2-muted)]">
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
            <span className="block text-sm font-medium text-[var(--v2-muted)]">
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
          <span className="block text-sm font-medium text-[var(--v2-muted)]">
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
          <span className="block text-sm font-medium text-[var(--v2-muted)]">
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
            className="mt-1 accent-[var(--v2-accent)]"
          />
          <span className="text-sm text-[var(--v2-fg)]">
            Exclude this event from the overall leaderboard and handicap
            tracking
          </span>
        </label>

        {error && (
          <div className="rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-[var(--v2-accent)] px-4 py-3 font-semibold text-black hover:bg-[var(--v2-accent-soft)] disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create event"}
        </button>
      </form>
    </V2PageShell>
  );
}
