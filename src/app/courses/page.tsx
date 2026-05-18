"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Course } from "@/lib/types";
import type { FavoriteCourseRow } from "@/app/api/favorites/route";

export default function CoursesPage() {
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
        c.name.toLowerCase().includes(s) ||
        c.city.toLowerCase().includes(s),
    );
  }, [courses, q]);

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-green-800">Courses</h1>
        <Link
          href="/courses/new"
          className="text-sm font-medium text-green-700 bg-white border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-50"
        >
          + Add
        </Link>
      </div>

      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name or city…"
        className="w-full mb-4 px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900"
      />

      {!q && favorites && favorites.length > 0 && (
        <div className="card p-0 overflow-hidden mb-4">
          <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wide font-semibold text-red-700">
            ♥ Favorites
          </div>
          <ul className="divide-y divide-gray-100">
            {favorites.map((c) => (
              <li key={`fav-${c.id}`}>
                <Link
                  href={`/courses/${c.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-red-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-800 truncate">
                      {c.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {c.city} · par {c.par} · {c.holes} holes
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        {filtered === null ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            No courses match.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/courses/${c.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-green-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-800 truncate">
                      {c.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {c.city} · par {c.par} · {c.holes} holes
                    </div>
                  </div>
                  <div className="text-right ml-2">
                    {c.course_rating != null && (
                      <div className="text-xs text-gray-500">
                        {c.course_rating}/{c.slope_rating ?? "—"}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
