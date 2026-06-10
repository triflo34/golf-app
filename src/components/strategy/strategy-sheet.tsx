"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { HoleData, StrategyResult } from "@/lib/strategy/types";

/**
 * In-scorer strategy overlay: a bottom sheet showing the strategy map +
 * caddie for the hole currently being scored, without leaving the live
 * scorer (no navigation, no lost scoring context).
 *
 * The MapLibre bundle is heavy, so the map component is loaded lazily the
 * first time the sheet opens. The drive distance persists in localStorage so
 * it follows the player from hole to hole and round to round.
 */

const HoleStrategyMap = dynamic(
  () => import("@/components/strategy/hole-map").then((m) => m.HoleStrategyMap),
  { ssr: false, loading: () => <MapLoading /> },
);

function MapLoading() {
  return (
    <div className="flex h-full items-center justify-center bg-[#0d1a0d]">
      <span className="animate-pulse text-sm text-[#d4af37]">Loading map…</span>
    </div>
  );
}

const DRIVE_KEY = "match_drive_yds";

export function readSavedDrive(): number {
  if (typeof window === "undefined") return 230;
  const v = Number(window.localStorage.getItem(DRIVE_KEY));
  return Number.isFinite(v) && v >= 150 && v <= 330 ? v : 230;
}

type ApiOk = {
  source: "overpass" | "cache" | "fixture";
  hole: HoleData;
  strategy: StrategyResult;
};

export function StrategySheet({
  courseId,
  holeNumber,
  onClose,
}: {
  courseId: number;
  holeNumber: number;
  onClose: () => void;
}) {
  const [drive, setDrive] = useState(230);
  const [debouncedDrive, setDebouncedDrive] = useState(230);
  const [data, setData] = useState<ApiOk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saved = readSavedDrive();
    setDrive(saved);
    setDebouncedDrive(saved);
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setDebouncedDrive(drive);
      try {
        window.localStorage.setItem(DRIVE_KEY, String(drive));
      } catch {}
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [drive]);

  const load = useCallback(async () => {
    setError(null);
    try {
      // The demo fixture only has hole 1.
      const qs = demo
        ? `demo=1&hole=1&drive=${debouncedDrive}`
        : `courseId=${courseId}&hole=${holeNumber}&drive=${debouncedDrive}`;
      const res = await fetch(`/api/strategy/hole?${qs}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        setData(null);
        setError(body.error ?? "Couldn't load hole data");
        return;
      }
      setData(body as ApiOk);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Couldn't load hole data");
    }
  }, [courseId, holeNumber, debouncedDrive, demo]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="flex h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[var(--v2-border,#e5e7eb)] bg-[var(--v2-bg-1,#f0fdf4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="text-sm font-semibold text-[var(--v2-text,#14532d)]">
            Hole {data?.hole.holeNumber ?? holeNumber} strategy
            {data && (
              <span className="text-[var(--v2-text-dim,#4b5563)]">
                {" "}· Par {data.hole.par} · {data.hole.lengthYards}y
              </span>
            )}
            {data?.source === "fixture" && (
              <span className="ml-1.5 rounded-full bg-[var(--v2-gold-fill,rgba(21,128,61,0.1))] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--v2-gold,#15803d)]">
                Demo
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xl leading-none text-[var(--v2-text-faint,#9ca3af)]"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1">
          {data ? (
            <HoleStrategyMap hole={data.hole} strategy={data.strategy} />
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#0d1a0d] px-6 text-center">
              <div className="text-sm text-red-300">{error}</div>
              {!demo && (
                <button
                  type="button"
                  onClick={() => setDemo(true)}
                  className="rounded-lg bg-[#d4af37] px-3 py-1.5 text-xs font-bold text-[#1a2e1a]"
                >
                  Show demo hole
                </button>
              )}
            </div>
          ) : (
            <MapLoading />
          )}
        </div>

        <div className="border-t border-[var(--v2-border,#e5e7eb)] px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--v2-text-dim,#4b5563)]">Drive</span>
            <input
              type="range"
              min={150}
              max={330}
              step={5}
              value={drive}
              onChange={(e) => setDrive(Number(e.target.value))}
              className="flex-1 accent-[var(--v2-gold,#15803d)]"
            />
            <span className="w-14 text-right text-xs font-bold text-[var(--v2-gold,#15803d)]">
              {drive} yds
            </span>
          </div>
          {data && (
            <p className="mt-1.5 line-clamp-3 text-xs text-[var(--v2-text,#14532d)]">
              {data.strategy.strategy}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
