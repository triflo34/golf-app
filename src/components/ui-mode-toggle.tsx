"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { UiMode } from "@/lib/ui-mode";

type Props = {
  currentMode: UiMode;
  /** Visual style — "classic" matches existing blue link buttons,
   *  "v2" matches the gold pill style. */
  style?: "classic" | "v2";
};

/**
 * Toggle that flips the ui_mode cookie and refreshes the page so the new
 * layout shell is picked up server-side (avoids any flash of wrong UI).
 */
export function UiModeToggle({ currentMode, style = "classic" }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const target: UiMode = currentMode === "v2" ? "classic" : "v2";
  const label =
    target === "v2" ? "Try the new UI" : "Back to classic UI";

  async function flip() {
    setError("");
    try {
      const res = await fetch("/api/ui-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: target }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Switch failed");
    }
  }

  const baseCls =
    style === "v2"
      ? "inline-flex items-center justify-center gap-1 rounded-full border border-[var(--v2-accent)] bg-transparent px-3 py-1 text-xs font-semibold text-[var(--v2-accent)] hover:bg-[var(--v2-accent)] hover:text-black disabled:opacity-50"
      : "text-sm font-medium text-blue-700 hover:text-blue-800 disabled:opacity-50";

  return (
    <>
      <button
        type="button"
        onClick={flip}
        disabled={pending}
        className={baseCls}
      >
        {pending ? "Switching…" : label}
      </button>
      {error && (
        <div className="mt-1 text-xs text-red-600">{error}</div>
      )}
    </>
  );
}
