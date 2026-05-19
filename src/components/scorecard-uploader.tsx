"use client";

import { useEffect, useRef, useState } from "react";

export type OcrLine = {
  text: string;
  numbers: number[];
};

export type OcrResult = {
  rawText: string;
  lines: OcrLine[];
};

type Props = {
  /** Called whenever the user picks a new photo (before OCR completes). */
  onPhotoChosen?: (file: File) => void;
  /** Called once OCR finishes. */
  onResult: (result: OcrResult) => void;
  /** Disabled while parent is submitting, etc. */
  disabled?: boolean;
};

/**
 * Photo input + Tesseract OCR runner. Loads tesseract.js lazily on the client
 * so we don't ship ~2MB to anyone who doesn't open the scorecard flow.
 */
export function ScorecardUploader({ onPhotoChosen, onResult, disabled }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
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
    setProgress(0);
    try {
      const tess = await import("tesseract.js");
      const worker = await tess.createWorker("eng", undefined, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });
      // Restrict OCR to digits + spaces — scorecards are grids of numbers and
      // generic OCR will hallucinate letters from handwritten figures.
      await worker.setParameters({
        tessedit_char_whitelist: "0123456789 ",
      });
      const { data } = await worker.recognize(url);
      await worker.terminate();

      // Tesseract.js 7 dropped the structured `lines` field from the default
      // output. Splitting the text by newline gives us the same row-by-row
      // breakdown that scorecards happen to be laid out in.
      const rawText = data.text ?? "";
      const lines: OcrLine[] = rawText
        .split(/\r?\n/)
        .map((text) => {
          const numbers = text
            .split(/\s+/)
            .map((w) => w.trim())
            .filter((w) => /^\d{1,2}$/.test(w))
            .map((w) => Number(w))
            .filter((n) => n >= 1 && n <= 20);
          return { text: text.trim(), numbers };
        })
        .filter((ln) => ln.text.length > 0 || ln.numbers.length > 0);
      onResult({ rawText, lines });
    } catch (e) {
      setError(e instanceof Error ? e.message : "OCR failed");
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
            // Allow picking the same file again later if needed.
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
          Reading scorecard… {progress}%{" "}
          <span className="text-gray-400">
            (first run downloads the OCR engine — may take a moment)
          </span>
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
