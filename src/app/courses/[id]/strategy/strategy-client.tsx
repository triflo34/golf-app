"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { HoleStrategyMap } from "@/components/strategy/hole-map";
import type { GeoJSONFeatureCollection, HoleData, StrategyResult } from "@/lib/strategy/types";

/**
 * Hole strategy screen. Styled with v2 tokens + explicit fallbacks
 * (var(--v2-x, fallback)) so it reads correctly in v2 dark, v2 light, AND the
 * classic UI — per the house rule that new features work in every mode.
 */

type ApiResponse = {
  course: string;
  source: "overpass" | "cache" | "fixture";
  fetched_at: string;
  available_holes: number[];
  hole: HoleData;
  geojson: GeoJSONFeatureCollection;
  strategy: StrategyResult;
};

type ApiError = { error: string; available_holes?: number[]; demo_available?: boolean };

const text = "text-[var(--v2-text,#14532d)]";
const dim = "text-[var(--v2-text-dim,#4b5563)]";
const accent = "text-[var(--v2-gold,#15803d)]";
const card =
  "rounded-xl border border-[var(--v2-border,#e5e7eb)] bg-[var(--v2-surface,#ffffff)] p-3.5";

export function StrategyClient({
  courseId,
  initialHole = 1,
}: {
  courseId: string;
  initialHole?: number;
}) {
  const { user, loading: authLoading } = useAuth();
  const [courseName, setCourseName] = useState<string>("");
  const [holeCount, setHoleCount] = useState(18);
  const [hole, setHole] = useState(initialHole);
  const [drive, setDrive] = useState(230);
  const [demo, setDemo] = useState(false);

  const [data, setData] = useState<ApiResponse | null>(null);
  const [availableHoles, setAvailableHoles] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoAvailable, setDemoAvailable] = useState(false);
  const [loading, setLoading] = useState(false);

  // Debounce drive-distance changes so dragging the slider fires one request.
  const driveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedDrive, setDebouncedDrive] = useState(drive);
  useEffect(() => {
    if (driveTimer.current) clearTimeout(driveTimer.current);
    driveTimer.current = setTimeout(() => setDebouncedDrive(drive), 250);
    return () => {
      if (driveTimer.current) clearTimeout(driveTimer.current);
    };
  }, [drive]);

  useEffect(() => {
    if (!user) return;
    fetch(`/api/courses/${courseId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.course?.name) setCourseName(d.course.name);
        if (Array.isArray(d?.holes) && d.holes.length > 0) setHoleCount(d.holes.length);
      })
      .catch(() => {});
  }, [user, courseId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = demo
        ? `demo=1&hole=${hole}&drive=${debouncedDrive}`
        : `courseId=${courseId}&hole=${hole}&drive=${debouncedDrive}`;
      const res = await fetch(`/api/strategy/hole?${qs}`, { cache: "no-store" });
      const body = (await res.json()) as ApiResponse | ApiError;
      if (!res.ok) {
        const err = body as ApiError;
        setData(null);
        setError(err.error ?? "Failed to load hole");
        setDemoAvailable(Boolean(err.demo_available) || demo === false);
        if (Array.isArray(err.available_holes)) setAvailableHoles(err.available_holes);
        return;
      }
      const ok = body as ApiResponse;
      setData(ok);
      setAvailableHoles(ok.available_holes);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load hole");
      setDemoAvailable(true);
    } finally {
      setLoading(false);
    }
  }, [courseId, hole, debouncedDrive, demo]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--v2-bg-1,#f0fdf4)]">
        <div className={`animate-pulse ${accent}`}>Loading…</div>
      </div>
    );
  }

  const holes = availableHoles && availableHoles.length > 0
    ? availableHoles
    : Array.from({ length: holeCount }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-[var(--v2-bg-1,#f0fdf4)] px-4 py-5">
      <div className="mx-auto max-w-lg space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Link href={`/courses/${courseId}`} className={`text-sm ${accent}`}>
            ← {courseName || "Course"}
          </Link>
          {data?.source === "fixture" && (
            <span className="rounded-full bg-[var(--v2-gold-fill,rgba(21,128,61,0.1))] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--v2-gold,#15803d)]">
              Demo data
            </span>
          )}
        </div>

        <h1 className={`text-lg font-semibold ${text}`}>
          Hole strategy{data ? ` · #${data.hole.holeNumber} · Par ${data.hole.par} · ${data.hole.lengthYards}y` : ""}
        </h1>

        {/* Hole selector */}
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
          {holes.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setHole(n)}
              className={`min-w-9 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                hole === n
                  ? "border-[var(--v2-gold,#15803d)] bg-[var(--v2-gold,#15803d)] text-[var(--v2-green-deep,#ffffff)]"
                  : `border-[var(--v2-border,#e5e7eb)] bg-[var(--v2-surface,#ffffff)] ${dim}`
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Drive distance */}
        <div className={card}>
          <div className="flex items-center justify-between text-sm">
            <span className={dim}>Average drive</span>
            <span className={`font-bold ${accent}`}>{drive} yds</span>
          </div>
          <input
            type="range"
            min={150}
            max={330}
            step={5}
            value={drive}
            onChange={(e) => setDrive(Number(e.target.value))}
            className="mt-1 w-full accent-[var(--v2-gold,#15803d)]"
          />
        </div>

        {/* Map */}
        <div className="h-[460px] overflow-hidden rounded-xl border border-[var(--v2-border,#e5e7eb)]">
          {data ? (
            <HoleStrategyMap hole={data.hole} strategy={data.strategy} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#0d1a0d] px-6 text-center">
              {loading ? (
                <div className="animate-pulse text-sm text-[#d4af37]">Loading hole…</div>
              ) : (
                <>
                  <div className="text-sm text-red-300">{error ?? "No data"}</div>
                  {demoAvailable && !demo && (
                    <button
                      type="button"
                      onClick={() => setDemo(true)}
                      className="rounded-lg bg-[#d4af37] px-3 py-1.5 text-xs font-bold text-[#1a2e1a]"
                    >
                      Load demo hole
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Caddie */}
        {data && (
          <div className={card}>
            <div className={`text-[11px] font-semibold uppercase tracking-wide ${accent}`}>
              Caddie
            </div>
            <p className={`mt-1 text-sm ${text}`}>{data.strategy.strategy}</p>
            <div className={`mt-2 text-xs ${dim}`}>
              <span className="font-semibold">Play:</span> {data.strategy.recommendedPlay}
            </div>
            {data.strategy.dangerAreas.length > 0 && (
              <ul className={`mt-2 space-y-0.5 text-xs ${dim}`}>
                {data.strategy.dangerAreas.map((d, i) => (
                  <li key={i}>⚠ {d}</li>
                ))}
              </ul>
            )}
            {data.strategy.landingZone && (
              <div className={`mt-2 text-xs ${dim}`}>
                Landing zone ±{data.strategy.landingZone.radiusYards}y ·{" "}
                {data.strategy.landingZone.remainingYards}y remaining
              </div>
            )}
            <div className="mt-2 text-[10px] text-[var(--v2-text-faint,#9ca3af)]">
              {data.source === "fixture"
                ? "Demo geometry — not the real course."
                : `Course data © OpenStreetMap contributors (${data.source === "cache" ? "cached" : "live"})`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
