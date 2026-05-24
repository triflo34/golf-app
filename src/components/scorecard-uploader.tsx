"use client";

import { useEffect, useRef, useState } from "react";

export type ParsedPlayer = { strokes: (number | null)[] };

export type ParseResult = {
  hole_count: 9 | 18;
  players: ParsedPlayer[];
  rawError?: string;
};

type Props = {
  /** Number of holes on the round being entered — sent to the parser. */
  holeCount: 9 | 18;
  /** Display names of players already in the form, in the order they were added. */
  playerNames: string[];
  /** Per-hole pars from the course; lets Claude identify and skip the par row. */
  pars: number[];
  /** Whether the player wrote absolute strokes or values relative to par. */
  entryMode: "strokes" | "to_par";
  /** Called whenever the user picks a new photo (before parsing finishes). */
  onPhotoChosen?: (file: File) => void;
  /** Called once Claude finishes parsing the scorecard. */
  onResult: (result: ParseResult) => void;
  /** Disabled while parent is submitting, etc. */
  disabled?: boolean;
};

/**
 * Sends the picked photo to /api/scorecard/parse, which uses Claude Vision
 * to extract per-player per-hole stroke counts. Replaces the older
 * Tesseract.js client-side pipeline.
 */
export function ScorecardUploader({
  holeCount,
  playerNames,
  pars,
  entryMode,
  onPhotoChosen,
  onResult,
  disabled,
}: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  async function handleFile(file: File) {
    setError(null);
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    onPhotoChosen?.(file);
    setRunning(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      form.append("hole_count", String(holeCount));
      form.append("player_names", JSON.stringify(playerNames));
      form.append("pars", JSON.stringify(pars));
      form.append("entry_mode", entryMode);
      const res = await fetch("/api/scorecard/parse", {
        method: "POST",
        body: form,
      });
      const body = (await res.json().catch(() => ({}))) as {
        hole_count?: 9 | 18;
        players?: ParsedPlayer[];
        error?: string;
        raw?: string;
      };
      if (!res.ok) {
        setError(body.error ?? `Parse failed (HTTP ${res.status})`);
        onResult({
          hole_count: holeCount,
          players: [],
          rawError: body.raw ?? body.error,
        });
        return;
      }
      onResult({
        hole_count: body.hole_count ?? holeCount,
        players: body.players ?? [],
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setError(msg);
      onResult({ hole_count: holeCount, players: [], rawError: msg });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          disabled={disabled || running}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || running}
          className="flex-1 rounded-md bg-green-700 px-4 py-2 text-white font-medium disabled:opacity-50"
        >
          {imageUrl ? "Replace photo" : "Take or upload photo"}
        </button>
      </div>

      {imageUrl && (
        <div className="rounded-md overflow-hidden border border-gray-200 bg-gray-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="Scorecard" className="w-full max-h-72 object-contain" />
        </div>
      )}

      {running && (
        <div className="text-xs text-gray-600">
          Reading scorecard with Claude Vision… (typically 5-15 seconds)
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
