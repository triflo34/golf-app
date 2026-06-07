"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Theme } from "@/lib/theme";

/**
 * Flips the v2_theme cookie (dark ⇆ light) and refreshes so the new
 * data-theme attribute is applied server-side — no flash of the wrong theme.
 * Reads the current theme from <html data-theme>, so it can drop into any v2
 * (client) screen without threading server state through.
 */
export function ThemeToggle() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [theme, setTheme] = useState<Theme>("dark");
  const [error, setError] = useState("");

  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    setTheme(t === "light" ? "light" : "dark");
  }, []);

  async function choose(target: Theme) {
    if (target === theme) return;
    setError("");
    // Optimistic: paint the new theme immediately, then persist + refresh.
    document.documentElement.setAttribute("data-theme", target);
    setTheme(target);
    try {
      const res = await fetch("/api/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: target }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Switch failed");
    }
  }

  return (
    <div className="v2-card flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-medium text-[var(--v2-text)]">Appearance</div>
        <div className="text-xs text-[var(--v2-text-dim)]">
          {theme === "light" ? "Light" : "Dark"} mode
        </div>
      </div>
      <div className="inline-flex overflow-hidden rounded-full border border-[var(--v2-border)]">
        {(["dark", "light"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => choose(t)}
            disabled={pending}
            className={`px-3 py-1 text-xs font-semibold capitalize disabled:opacity-50 ${
              theme === t
                ? "bg-[var(--v2-gold)] text-[var(--v2-green-deep)]"
                : "text-[var(--v2-text-dim)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {error && <div className="text-xs text-[var(--v2-danger-text)]">{error}</div>}
    </div>
  );
}
