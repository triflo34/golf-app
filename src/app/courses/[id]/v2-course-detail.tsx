"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { V2PageShell } from "@/components/v2/page-shell";
import { V2Card } from "@/components/v2/card";
import { V2StatTile } from "@/components/v2/stat-tile";
import { V2SectionTitle } from "@/components/v2/section-title";
import type { CourseDetail } from "@/app/api/courses/[id]/route";

export function V2CourseDetail() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<CourseDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    if (!params?.id) return;
    fetch(`/api/courses/${params.id}`, { cache: "no-store" })
      .then((r) => {
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

  useEffect(() => {
    load();
  }, [load]);

  if (notFound) {
    return (
      <V2PageShell>
        <Link href="/courses" className="text-sm font-medium text-[var(--v2-accent)]">
          ← Courses
        </Link>
        <V2Card className="mt-4">
          <div className="py-8 text-center text-[var(--v2-muted)]">
            Course not found.
          </div>
        </V2Card>
      </V2PageShell>
    );
  }

  if (!data) {
    return (
      <V2PageShell>
        <div className="animate-pulse text-[var(--v2-accent)]">Loading…</div>
      </V2PageShell>
    );
  }

  const c = data.course;

  return (
    <V2PageShell>
      <Link href="/courses" className="text-sm font-medium text-[var(--v2-accent)]">
        ← Courses
      </Link>

      <V2Card className="mb-4 mt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="mb-1 text-2xl font-bold text-white">{c.name}</h1>
            <div className="text-sm text-[var(--v2-muted)]">
              {c.city}, {c.state}
            </div>
            {c.address && (
              <div className="mt-1 text-xs text-[var(--v2-muted)]">{c.address}</div>
            )}
          </div>
          <FavoriteToggle
            courseId={c.id}
            initialFavorite={data.is_favorite ?? false}
          />
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          <V2StatTile label="Par" value={c.par} tone="gold" />
          <V2StatTile label="Holes" value={c.holes} tone="white" />
          <V2StatTile label="Rating" value={c.course_rating ?? "—"} tone="green" />
          <V2StatTile label="Slope" value={c.slope_rating ?? "—"} tone="green" />
        </div>

        {c.phone && (
          <div className="mt-3 text-sm text-[var(--v2-muted)]">📞 {c.phone}</div>
        )}
      </V2Card>

      {c.external_id &&
        c.last_fetched_at &&
        daysAgo(c.last_fetched_at) >= 30 && (
          <V2Card className="mb-4 border-amber-700 bg-amber-950/30">
            <div className="font-semibold text-amber-300">
              Course data may be out of date
            </div>
            <div className="text-xs text-amber-200/80">
              Last refreshed {daysAgo(c.last_fetched_at)} days ago.
              {user?.is_admin
                ? " Use the admin tools below to pull fresh data."
                : " Ask an admin to refresh from GolfCourseAPI."}
            </div>
          </V2Card>
        )}

      {data.holes && data.holes.length > 0 && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold text-[var(--v2-accent)]">
              Scorecard
            </h2>
            {user?.is_admin && (
              <Link
                href={`/courses/${c.id}/edit-holes`}
                className="rounded-full border border-amber-700 px-2 py-1 text-xs font-medium text-amber-300 hover:bg-amber-950/40"
              >
                Edit holes
              </Link>
            )}
          </div>
          <V2Card className="mb-4">
            <CourseScorecard holes={data.holes} />
          </V2Card>
        </>
      )}

      <V2SectionTitle>
        Top Scores ({data.rounds_played} rounds played here)
      </V2SectionTitle>
      <V2Card>
        {data.top_scores.length === 0 ? (
          <div className="py-6 text-center text-sm text-[var(--v2-muted)]">
            No rounds logged at this course yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {data.top_scores.map((s, i) => (
              <div
                key={`${i}-${s.played_at}-${s.gross_score}`}
                className="flex items-center justify-between rounded-lg bg-[var(--v2-surface-2)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 truncate text-sm font-semibold text-white">
                    {s.name}
                    {s.is_guest && (
                      <span className="rounded bg-[var(--v2-accent)]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--v2-accent)]">
                        guest
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--v2-muted)]">
                    {formatDate(s.played_at)}
                  </div>
                </div>
                <div className="ml-2 text-xl font-bold text-[var(--v2-score)]">
                  {s.gross_score}
                </div>
              </div>
            ))}
          </div>
        )}
      </V2Card>

      {user?.is_admin && (
        <div className="mt-4">
          <V2SectionTitle>Admin tools</V2SectionTitle>
          <V2Card>
            <div className="text-xs text-[var(--v2-muted)]">
              Switch to the classic UI from your{" "}
              <Link
                href="/profile"
                className="text-[var(--v2-accent)] hover:underline"
              >
                Profile
              </Link>{" "}
              for the full admin panel on this course (rename, refresh from
              GolfCourseAPI, re-link).
            </div>
          </V2Card>
        </div>
      )}
    </V2PageShell>
  );
}

function CourseScorecard({
  holes,
}: {
  holes: {
    hole_number: number;
    par: number;
    handicap_index: number | null;
    yardage: number | null;
  }[];
}) {
  const front = holes.filter((h) => h.hole_number <= 9);
  const back = holes.filter((h) => h.hole_number > 9);
  const hasYardage = holes.some((h) => h.yardage != null);
  const hasHandicap = holes.some((h) => h.handicap_index != null);

  function nine(rows: typeof holes, label: string) {
    if (rows.length === 0) return null;
    const totalPar = rows.reduce((s, h) => s + h.par, 0);
    const totalYards = rows.reduce((s, h) => s + (h.yardage ?? 0), 0);
    return (
      <div className="-mx-1 overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="text-[var(--v2-muted)]">
              <th className="px-2 py-1 text-left font-medium">{label}</th>
              {rows.map((h) => (
                <th key={h.hole_number} className="px-2 py-1 font-medium">
                  {h.hole_number}
                </th>
              ))}
              <th className="px-2 py-1 font-medium text-white">Out</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-[var(--v2-border)]">
              <td className="px-2 py-1 text-[var(--v2-muted)]">Par</td>
              {rows.map((h) => (
                <td
                  key={h.hole_number}
                  className="px-2 py-1 text-center text-white"
                >
                  {h.par}
                </td>
              ))}
              <td className="px-2 py-1 text-center font-semibold text-[var(--v2-accent)]">
                {totalPar}
              </td>
            </tr>
            {hasYardage && (
              <tr className="border-t border-[var(--v2-border)]">
                <td className="px-2 py-1 text-[var(--v2-muted)]">Yds</td>
                {rows.map((h) => (
                  <td
                    key={h.hole_number}
                    className="px-2 py-1 text-center text-[var(--v2-fg)]"
                  >
                    {h.yardage ?? "—"}
                  </td>
                ))}
                <td className="px-2 py-1 text-center font-semibold text-[var(--v2-fg)]">
                  {totalYards || "—"}
                </td>
              </tr>
            )}
            {hasHandicap && (
              <tr className="border-t border-[var(--v2-border)]">
                <td className="px-2 py-1 text-[var(--v2-muted)]">HCP</td>
                {rows.map((h) => (
                  <td
                    key={h.hole_number}
                    className="px-2 py-1 text-center text-[var(--v2-muted)]"
                  >
                    {h.handicap_index ?? "—"}
                  </td>
                ))}
                <td className="px-2 py-1 text-center text-[var(--v2-muted)]">
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {nine(front, "Front")}
      {nine(back, "Back")}
    </div>
  );
}

function FavoriteToggle({
  courseId,
  initialFavorite,
}: {
  courseId: number;
  initialFavorite: boolean;
}) {
  const [fav, setFav] = useState(initialFavorite);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFav(initialFavorite);
  }, [initialFavorite]);

  async function toggle() {
    if (busy) return;
    const next = !fav;
    setFav(next);
    setBusy(true);
    try {
      const res = next
        ? await fetch(`/api/favorites`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ course_id: courseId }),
          })
        : await fetch(`/api/favorites?course_id=${courseId}`, {
            method: "DELETE",
          });
      if (!res.ok) throw new Error();
    } catch {
      setFav(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={fav}
      aria-label={fav ? "Unfavorite" : "Favorite"}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl transition ${
        fav
          ? "bg-red-950/60 text-red-300 hover:bg-red-950"
          : "bg-[var(--v2-surface-2)] text-[var(--v2-muted)] hover:text-red-300"
      } disabled:opacity-50`}
    >
      {fav ? "♥" : "♡"}
    </button>
  );
}

function formatDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function daysAgo(timestamp: string): number {
  const ms = Date.now() - new Date(timestamp).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}
