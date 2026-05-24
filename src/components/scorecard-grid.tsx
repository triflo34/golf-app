"use client";

import { useMemo, useRef, useState } from "react";
import type { User } from "@/lib/types";

export type GridPlayer = {
  user: User;
  /** Per-hole strokes (absolute), length === holeCount. null = not yet entered. */
  strokes: (number | null)[];
};

/**
 * "strokes" — user types absolute strokes (4, 5, 6…).
 * "to_par" — user types signed diff vs par (0=par, -1=birdie, 2=double…); we
 *   convert to absolute strokes for storage so the rest of the app stays the same.
 */
export type EntryMode = "strokes" | "to_par";

type Props = {
  holeCount: 9 | 18;
  pars: number[];
  players: GridPlayer[];
  onChange: (next: GridPlayer[]) => void;
  onRemovePlayer: (userId: string) => void;
  entryMode: EntryMode;
};

function classifyTone(diff: number): string {
  if (diff <= -2) return "bg-yellow-100 text-yellow-800";
  if (diff === -1) return "bg-red-100 text-red-700";
  if (diff === 0) return "bg-green-100 text-green-700";
  if (diff === 1) return "bg-blue-50 text-blue-700";
  if (diff === 2) return "bg-blue-100 text-blue-800";
  return "bg-gray-100 text-gray-700";
}

export function ScorecardGrid({
  holeCount,
  pars,
  players,
  onChange,
  onRemovePlayer,
  entryMode,
}: Props) {
  const holes = useMemo(
    () => Array.from({ length: holeCount }, (_, i) => i + 1),
    [holeCount],
  );

  // Per-cell typing buffer: tracks the raw text in cells that are currently
  // being edited but don't yet parse to a valid stroke (e.g. a lone "-" in
  // vs-par mode while the user is still typing "-1"). Cleared on blur.
  const [typing, setTyping] = useState<Map<string, string>>(new Map());
  const [focused, setFocused] = useState<{
    userId: string;
    holeIdx: number;
  } | null>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());

  function setCell(userId: string, holeIdx: number, raw: string) {
    const key = `${userId}:${holeIdx}`;
    setTyping((prev) => {
      const m = new Map(prev);
      if (raw === "") m.delete(key);
      else m.set(key, raw);
      return m;
    });

    const trimmed = raw.trim();
    const par = pars[holeIdx] ?? 4;
    let value: number | null = null;
    if (trimmed !== "" && trimmed !== "-" && trimmed !== "+") {
      const n = Number(trimmed);
      if (Number.isInteger(n)) {
        const abs = entryMode === "to_par" ? par + n : n;
        if (abs >= 1 && abs <= 20) value = abs;
      }
    }
    onChange(
      players.map((p) =>
        p.user.id === userId
          ? {
              ...p,
              strokes: p.strokes.map((s, i) => (i === holeIdx ? value : s)),
            }
          : p,
      ),
    );
  }

  function clearTyping(userId: string, holeIdx: number) {
    const key = `${userId}:${holeIdx}`;
    setTyping((prev) => {
      if (!prev.has(key)) return prev;
      const m = new Map(prev);
      m.delete(key);
      return m;
    });
  }

  function applyQuick(diff: number) {
    if (!focused) return;
    const par = pars[focused.holeIdx] ?? 4;
    const abs = Math.max(1, Math.min(20, par + diff));
    onChange(
      players.map((p) =>
        p.user.id === focused.userId
          ? {
              ...p,
              strokes: p.strokes.map((s, i) =>
                i === focused.holeIdx ? abs : s,
              ),
            }
          : p,
      ),
    );
    clearTyping(focused.userId, focused.holeIdx);
    const nextHoleIdx = focused.holeIdx + 1;
    if (nextHoleIdx < holeCount) {
      const nextKey = `${focused.userId}:${nextHoleIdx}`;
      const el = inputRefs.current.get(nextKey);
      if (el) {
        el.focus();
        el.select();
      }
    }
  }

  const QUICK_BUTTONS: { label: string; diff: number }[] = [
    { label: "Eagle", diff: -2 },
    { label: "Birdie", diff: -1 },
    { label: "Par", diff: 0 },
    { label: "Bogey", diff: 1 },
    { label: "Double", diff: 2 },
    { label: "Triple", diff: 3 },
  ];

  // What the input shows for a given absolute stroke count.
  function displayValue(strokes: number | null, par: number): string {
    if (strokes == null) return "";
    if (entryMode === "strokes") return String(strokes);
    return String(strokes - par);
  }

  const totalPar = pars.slice(0, holeCount).reduce((a, b) => a + b, 0);

  const focusedPar = focused ? pars[focused.holeIdx] ?? 4 : null;
  const focusedPlayer = focused
    ? players.find((p) => p.user.id === focused.userId)
    : null;

  return (
    <div className="space-y-2">
      {focused && focusedPar != null && focusedPlayer && (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-2 py-2">
          <div className="text-[11px] text-gray-500 mb-1">
            Hole {focused.holeIdx + 1} (par {focusedPar}) ·{" "}
            {focusedPlayer.user.display_name}
          </div>
          <div className="flex flex-wrap gap-1">
            {QUICK_BUTTONS.map((b) => {
              const abs = focusedPar + b.diff;
              if (abs < 1 || abs > 20) return null;
              const tone = classifyTone(b.diff);
              return (
                <button
                  key={b.label}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyQuick(b.diff)}
                  className={`px-2.5 py-1 rounded text-xs font-medium ${tone} hover:opacity-80`}
                >
                  {b.label} ({abs})
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="min-w-max border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white text-left px-2 py-1.5 text-xs font-semibold text-gray-600 border-b border-gray-200">
              Hole
            </th>
            {holes.map((h) => (
              <th
                key={h}
                className="px-1 py-1.5 text-xs font-semibold text-gray-600 border-b border-gray-200 w-9 text-center"
              >
                {h}
              </th>
            ))}
            <th className="px-2 py-1.5 text-xs font-semibold text-gray-600 border-b border-gray-200 text-center">
              Tot
            </th>
          </tr>
          <tr>
            <th className="sticky left-0 z-10 bg-white text-left px-2 py-1.5 text-xs font-medium text-gray-500 border-b border-gray-200">
              Par
            </th>
            {holes.map((h, i) => (
              <th
                key={h}
                className="px-1 py-1.5 text-xs font-medium text-gray-500 border-b border-gray-200 text-center"
              >
                {pars[i] ?? "—"}
              </th>
            ))}
            <th className="px-2 py-1.5 text-xs font-medium text-gray-500 border-b border-gray-200 text-center">
              {totalPar || "—"}
            </th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            let total = 0;
            let parEntered = 0;
            let entered = 0;
            for (let i = 0; i < holeCount; i++) {
              const s = p.strokes[i];
              if (s != null) {
                total += s;
                parEntered += pars[i] ?? 4;
                entered += 1;
              }
            }
            const vsPar = total - parEntered;
            const totalDisplay =
              entryMode === "to_par"
                ? `${vsPar > 0 ? "+" : ""}${vsPar}`
                : String(total);
            return (
              <tr key={p.user.id}>
                <td className="sticky left-0 z-10 bg-white px-2 py-1.5 border-b border-gray-100">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-gray-800 truncate max-w-[7.5rem]">
                      {p.user.display_name}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemovePlayer(p.user.id)}
                      className="text-xs text-gray-400 hover:text-red-600"
                      title="Remove player"
                    >
                      ×
                    </button>
                  </div>
                </td>
                {holes.map((h, i) => {
                  const v = p.strokes[i] ?? null;
                  const par = pars[i] ?? 4;
                  const tone = v != null ? classifyTone(v - par) : "";
                  const key = `${p.user.id}:${i}`;
                  const buffer = typing.get(key);
                  const shown = buffer ?? displayValue(v, par);
                  return (
                    <td
                      key={h}
                      className="px-0.5 py-1 border-b border-gray-100 text-center"
                    >
                      <input
                        ref={(el) => {
                          inputRefs.current.set(key, el);
                        }}
                        type="text"
                        inputMode={entryMode === "to_par" ? "text" : "numeric"}
                        pattern={entryMode === "to_par" ? "-?[0-9]*" : "[0-9]*"}
                        value={shown}
                        onChange={(e) => setCell(p.user.id, i, e.target.value)}
                        onFocus={(e) => {
                          setFocused({ userId: p.user.id, holeIdx: i });
                          e.target.select();
                        }}
                        onBlur={() => clearTyping(p.user.id, i)}
                        className={`w-8 h-8 text-center text-sm rounded border border-gray-200 focus:border-green-500 focus:outline-none ${tone}`}
                      />
                    </td>
                  );
                })}
                <td className="px-2 py-1 border-b border-gray-100 text-center text-sm font-semibold text-gray-800">
                  {entered === holeCount
                    ? totalDisplay
                    : `${totalDisplay}/${entered}`}
                </td>
              </tr>
            );
          })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
