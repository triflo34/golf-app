"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { CourseDetail } from "@/app/api/courses/[id]/route";

export default function CourseDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<CourseDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!params?.id) return;
    fetch(`/api/courses/${params.id}`)
      .then(async (r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d) setData(d);
      });
  }, [params?.id]);

  if (notFound) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href="/courses" className="text-sm text-green-700 font-medium">
          ← Courses
        </Link>
        <div className="card mt-4 text-center py-10 text-gray-400">
          Course not found.
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="animate-pulse text-green-700">Loading...</div>
      </div>
    );
  }

  const c = data.course;

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <Link href="/courses" className="text-sm text-green-700 font-medium">
        ← Courses
      </Link>

      <div className="card mt-3 mb-4">
        <h1 className="text-2xl font-bold text-green-800 mb-1">{c.name}</h1>
        <div className="text-sm text-gray-500">{c.city}, {c.state}</div>
        {c.address && (
          <div className="text-xs text-gray-400 mt-1">{c.address}</div>
        )}

        <div className="grid grid-cols-4 gap-2 mt-4 text-center">
          <Stat label="par" value={c.par} />
          <Stat label="holes" value={c.holes} />
          <Stat label="rating" value={c.course_rating ?? "—"} />
          <Stat label="slope" value={c.slope_rating ?? "—"} />
        </div>

        {c.phone && (
          <div className="text-sm text-gray-600 mt-3">📞 {c.phone}</div>
        )}
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-3 text-sm">
          Top scores ({data.rounds_played} rounds played here)
        </h2>
        {data.top_scores.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">
            No rounds logged at this course yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {data.top_scores.map((s, i) => (
              <div
                key={`${i}-${s.played_at}-${s.gross_score}`}
                className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-gray-800 truncate flex items-center gap-1.5">
                    {s.name}
                    {s.is_guest && (
                      <span className="text-[10px] font-semibold text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">
                        guest
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDate(s.played_at)}
                  </div>
                </div>
                <div className="text-lg font-bold text-green-700 ml-2">
                  {s.gross_score}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-lg font-bold text-green-700">{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function formatDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}
