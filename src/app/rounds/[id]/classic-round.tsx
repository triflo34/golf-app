"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { HoleScorecard } from "@/components/v2/hole-scorecard";
import type {
  RoundDetail,
  RoundWeatherSummary,
} from "@/app/api/rounds/[id]/route";
import { wmoLabel } from "@/lib/weather-labels";

export function ClassicRound() {
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
      .then((d) => {
        if (d) setData(d);
      });
  }, [params?.id]);

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
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href="/" className="text-sm text-green-700 font-medium">
          ← Home
        </Link>
        <div className="card mt-4 text-center py-10 text-gray-400">
          Round not found.
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

  const winners =
    data.scores.length >= 2
      ? data.scores.filter(
          (s) =>
            s.gross_score === Math.min(...data.scores.map((x) => x.gross_score)),
        )
      : [];

  const hasAnyHoleStrokes = data.scores.some((s) =>
    s.hole_strokes.some((v) => v != null),
  );

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <Link href="/" className="text-sm text-green-700 font-medium">
        ← Home
      </Link>

      <div className="card mt-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/courses/${data.course_id}`}
            className="text-xs text-green-700 font-medium hover:underline"
          >
            {data.course_name} →
          </Link>
          {data.hole_count === 9 && (
            <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
              9 holes
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold text-gray-800 mt-1">
          {formatLongDate(data.played_at)}
        </h1>
        <div className="text-xs text-gray-500 mt-1">
          logged by {data.created_by_name}
        </div>
        {data.notes && (
          <div className="mt-3 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
            {data.notes}
          </div>
        )}
        {data.weather && <WeatherStrip weather={data.weather} />}
      </div>

      <div className="card mb-4">
        <h2 className="font-semibold text-gray-800 mb-3 text-sm">Scores</h2>
        <div className="space-y-2">
          {data.scores.map((s, i) => {
            const isWinner = winners.length === 1 && winners[0].id === s.id;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-3 p-3 rounded-xl ${
                  isWinner
                    ? "bg-yellow-50 border border-yellow-200"
                    : "bg-gray-50"
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                    isWinner
                      ? "bg-yellow-400 text-yellow-900"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800 truncate flex items-center gap-1.5">
                    {s.name}
                    {s.is_guest && (
                      <span className="text-[10px] font-semibold text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">
                        guest
                      </span>
                    )}
                  </div>
                  {s.username && (
                    <div className="text-xs text-gray-500">@{s.username}</div>
                  )}
                </div>
                <div className="text-2xl font-bold text-green-700">
                  {s.gross_score}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {hasAnyHoleStrokes && (
        <div className="card mb-4">
          <h2 className="font-semibold text-gray-800 mb-3 text-sm">
            Scorecard
          </h2>
          <HoleScorecard
            holeCount={data.hole_count}
            pars={data.pars}
            scores={data.scores}
            variant="classic"
          />
          <div className="mt-3 space-y-2">
            {data.scores
              .filter((s) => s.hole_stats)
              .map((s) => (
                <div
                  key={`stats-${s.id}`}
                  className="bg-gray-50 rounded-lg px-3 py-2"
                >
                  <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1">
                    {s.name}
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                    <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                      🦅 {s.hole_stats!.eagles}
                    </span>
                    <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded">
                      Birdies {s.hole_stats!.birdies}
                    </span>
                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">
                      Pars {s.hole_stats!.pars}
                    </span>
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                      Bogeys {s.hole_stats!.bogeys}
                    </span>
                    <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                      2+ {s.hole_stats!.doubles_plus}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {data.can_edit && (
        <div className="flex gap-2">
          <Link
            href={`/rounds/${data.id}/edit`}
            className="flex-1 py-2.5 bg-green-700 text-white text-center font-medium rounded-lg hover:bg-green-800 transition"
          >
            Edit
          </Link>
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="flex-1 py-2.5 bg-white text-red-600 border border-red-200 font-medium rounded-lg hover:bg-red-50 transition"
            >
              Delete
            </button>
          ) : (
            <>
              <button
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="flex-1 py-2.5 bg-white text-gray-600 border border-gray-200 font-medium rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 bg-red-600 text-white font-medium rounded-lg disabled:opacity-50"
              >
                {deleting ? "..." : "Delete?"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
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

function WeatherStrip({ weather }: { weather: RoundWeatherSummary }) {
  const hi = weather.temp_high_f;
  const lo = weather.temp_low_f;
  const wind = weather.wind_max_mph;
  const precip = weather.precip_in;
  const label = wmoLabel(weather.weather_code);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 bg-blue-50/60 rounded-lg px-3 py-2">
      <span className="font-medium text-gray-800">{label}</span>
      {hi != null && lo != null && (
        <span>
          <span className="text-gray-400">Hi/Lo</span> {Math.round(hi)}° /{" "}
          {Math.round(lo)}°
        </span>
      )}
      {wind != null && (
        <span>
          <span className="text-gray-400">Wind</span> {Math.round(wind)} mph
        </span>
      )}
      {precip != null && precip > 0 && (
        <span>
          <span className="text-gray-400">Precip</span> {precip.toFixed(2)}&quot;
        </span>
      )}
    </div>
  );
}
