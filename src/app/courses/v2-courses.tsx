"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { V2PageShell } from "@/components/v2/page-shell";
import { V2Card } from "@/components/v2/card";
import { V2SectionTitle } from "@/components/v2/section-title";
import type { Course } from "@/lib/types";
import type { FavoriteCourseRow } from "@/app/api/favorites/route";

export function V2Courses() {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [favorites, setFavorites] = useState<FavoriteCourseRow[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/courses")
      .then((r) => r.json())
      .then((d) => setCourses(d.courses ?? []));
    fetch("/api/favorites")
      .then((r) => r.json())
      .then((d) => setFavorites(d.favorites ?? []))
      .catch(() => setFavorites([]));
  }, []);

  const filtered = useMemo(() => {
    if (!courses) return null;
    const s = q.trim().toLowerCase();
    if (!s) return courses;
    return courses.filter(
      (c) =>
        c.name.toLowerCase().includes(s) || c.city.toLowerCase().includes(s),
    );
  }, [courses, q]);

  return (
    <V2PageShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Courses</h1>
        <Link
          href="/courses/new"
          className="rounded-full border border-[var(--v2-score)] px-3 py-1.5 text-sm font-semibold text-[var(--v2-score)] hover:bg-[var(--v2-score)] hover:text-black"
        >
          + Add
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-2">
        <span className="text-[var(--v2-muted)]">🔍</span>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or city"
          className="flex-1 bg-transparent text-sm text-white placeholder-[var(--v2-muted)] outline-none"
        />
      </div>

      {!q && favorites && favorites.length > 0 && (
        <div className="mb-4">
          <V2SectionTitle>
            <span className="flex items-center gap-1">
              <span className="text-red-400">♥</span> Favorites
            </span>
          </V2SectionTitle>
          <V2Card className="!p-0">
            <ul className="divide-y divide-[var(--v2-border)]">
              {favorites.map((c) => (
                <li key={`fav-${c.id}`}>
                  <Link
                    href={`/courses/${c.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--v2-surface-2)]"
                  >
                    <CourseIcon />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-white">
                        {c.name}
                      </div>
                      <div className="text-xs text-[var(--v2-muted)]">
                        {c.city} · par {c.par}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-[var(--v2-accent)]">
                      {c.holes} holes
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </V2Card>
        </div>
      )}

      <V2Card className="!p-0">
        {filtered === null ? (
          <div className="py-8 text-center text-[var(--v2-muted)]">
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--v2-muted)]">
            No courses match.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--v2-border)]">
            {filtered.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/courses/${c.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--v2-surface-2)]"
                >
                  <CourseIcon />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-white">
                      {c.name}
                    </div>
                    <div className="text-xs text-[var(--v2-muted)]">
                      {c.city} · par {c.par}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-[var(--v2-accent)]">
                    {c.holes} holes
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </V2Card>
    </V2PageShell>
  );
}

function CourseIcon() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--v2-score)]/20 text-[var(--v2-score-soft)]">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-5 w-5"
      >
        <path d="M3 18l6-9 4 5 4-3 4 7H3z" />
      </svg>
    </div>
  );
}
