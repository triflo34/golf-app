"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { V2PageShell } from "@/components/v2/page-shell";
import { V2Card } from "@/components/v2/card";
import { V2SectionTitle } from "@/components/v2/section-title";
import { HoleScorecard } from "@/components/v2/hole-scorecard";
import type {
  RoundDetail,
  RoundWeatherSummary,
} from "@/app/api/rounds/[id]/route";
import { wmoLabel } from "@/lib/weather-labels";

export function V2Round() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<RoundDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!params?.id) return;
    fetch(`/api/rounds/${params.id}`, { cache: "no-store" })
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((d: RoundDetail | null) => {
        if (!d) return;
        if (d.status === "live") {
          router.replace(`/rounds/live/${d.id}`);
          return;
        }
        setData(d);
      });
  }, [params?.id, router]);

  async function handleDelete() {
    if (!params?.id) return;
    setDeleting(true);
    const res = await fetch(`/api/rounds/${params.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "Delete failed");
      setDeleting(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  if (notFound) {
    return (
      <V2PageShell>
        <Link
          href="/"
          className="text-sm font-medium text-[var(--v2-accent)]"
        >
          ← Home
        </Link>
        <V2Card className="mt-4">
          <div className="py-8 text-center text-[var(--v2-muted)]">
            Round not found.
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

  const minScore = Math.min(...data.scores.map((x) => x.gross_score));
  const winners =
    data.scores.length >= 2
      ? data.scores.filter((s) => s.gross_score === minScore)
      : [];

  const hasAnyHoleStrokes = data.scores.some((s) =>
    s.hole_strokes.some((v) => v != null),
  );

  return (
    <V2PageShell>
      <Link href="/" className="text-sm font-medium text-[var(--v2-accent)]">
        ← Home
      </Link>

      <V2Card className="mb-4 mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/courses/${data.course_id}`}
            className="text-xs font-medium text-[var(--v2-accent)] hover:underline"
          >
            {data.course_name} →
          </Link>
          {data.hole_count === 9 && (
            <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">
              9 holes
            </span>
          )}
        </div>
        <h1 className="mt-1 text-xl font-bold text-white">
          {formatLongDate(data.played_at)}
        </h1>
        <div className="mt-1 text-xs text-[var(--v2-muted)]">
          logged by {data.created_by_name}
        </div>
        {data.notes && (
          <div className="mt-3 rounded-lg bg-[var(--v2-surface-2)] px-3 py-2 text-sm text-[var(--v2-fg)]">
            {data.notes}
          </div>
        )}
        {data.weather && <V2WeatherStrip weather={data.weather} />}
      </V2Card>

      <V2SectionTitle>Scores</V2SectionTitle>
      <div className="mb-4 space-y-2">
        {data.scores.map((s, i) => {
          const isWinner = winners.length === 1 && winners[0].id === s.id;
          return (
            <V2Card key={s.id} className="!p-3">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                    isWinner
                      ? "bg-[var(--v2-accent)] text-black"
                      : "bg-[var(--v2-surface-2)] text-[var(--v2-muted)]"
                  }`}
                >
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 truncate font-semibold text-white">
                    {s.name}
                    {s.is_guest && (
                      <span className="rounded bg-[var(--v2-accent)]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--v2-accent)]">
                        guest
                      </span>
                    )}
                  </div>
                  {s.username && (
                    <div className="text-xs text-[var(--v2-muted)]">
                      @{s.username}
                    </div>
                  )}
                </div>
                <div className="text-3xl font-bold text-[var(--v2-score)]">
                  {s.gross_score}
                </div>
              </div>
            </V2Card>
          );
        })}
      </div>

      {hasAnyHoleStrokes && (
        <>
          <V2SectionTitle>Scorecard</V2SectionTitle>
          <V2Card className="mb-4">
            <HoleScorecard
              holeCount={data.hole_count}
              pars={data.pars}
              scores={data.scores}
              variant="v2"
            />
          </V2Card>

          <V2SectionTitle>Hole stats</V2SectionTitle>
          <div className="mb-4 space-y-2">
            {data.scores
              .filter((s) => s.hole_stats)
              .map((s) => (
                <V2Card key={`stats-${s.id}`} className="!p-3">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--v2-muted)]">
                    {s.name}
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                    <span className="rounded bg-[var(--v2-accent)]/20 px-2 py-0.5 text-[var(--v2-accent)]">
                      🦅 {s.hole_stats!.eagles}
                    </span>
                    <span className="rounded bg-red-500/20 px-2 py-0.5 text-red-300">
                      Birdies {s.hole_stats!.birdies}
                    </span>
                    <span className="rounded bg-[var(--v2-score)]/20 px-2 py-0.5 text-[var(--v2-score-soft)]">
                      Pars {s.hole_stats!.pars}
                    </span>
                    <span className="rounded bg-blue-500/25 px-2 py-0.5 text-blue-300">
                      Bogeys {s.hole_stats!.bogeys}
                    </span>
                    <span className="rounded bg-blue-700/40 px-2 py-0.5 text-blue-200">
                      2+ {s.hole_stats!.doubles_plus}
                    </span>
                  </div>
                </V2Card>
              ))}
          </div>
        </>
      )}

      {data.can_edit && (
        <div className="flex gap-2 pb-2">
          <Link
            href={`/rounds/${data.id}/edit`}
            className="flex-1 rounded-2xl bg-[var(--v2-accent)] py-2.5 text-center text-sm font-semibold text-black hover:bg-[var(--v2-accent-soft)]"
          >
            Edit
          </Link>
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="flex-1 rounded-2xl border border-red-900 bg-transparent py-2.5 text-sm font-semibold text-red-400 hover:bg-red-950/40"
            >
              Delete
            </button>
          ) : (
            <>
              <button
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="flex-1 rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] py-2.5 text-sm font-semibold text-[var(--v2-muted)]"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 rounded-2xl bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {deleting ? "…" : "Delete?"}
              </button>
            </>
          )}
        </div>
      )}
    </V2PageShell>
  );
}

function formatLongDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function V2WeatherStrip({ weather }: { weather: RoundWeatherSummary }) {
  const hi = weather.temp_high_f;
  const lo = weather.temp_low_f;
  const wind = weather.wind_max_mph;
  const precip = weather.precip_in;
  const label = wmoLabel(weather.weather_code);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-blue-950/40 px-3 py-2 text-xs text-[var(--v2-muted)]">
      <span className="font-medium text-white">{label}</span>
      {hi != null && lo != null && (
        <span>
          <span className="text-[var(--v2-muted)]">Hi/Lo</span>{" "}
          {Math.round(hi)}° / {Math.round(lo)}°
        </span>
      )}
      {wind != null && (
        <span>
          <span className="text-[var(--v2-muted)]">Wind</span>{" "}
          {Math.round(wind)} mph
        </span>
      )}
      {precip != null && precip > 0 && (
        <span>
          <span className="text-[var(--v2-muted)]">Precip</span>{" "}
          {precip.toFixed(2)}&quot;
        </span>
      )}
    </div>
  );
}
