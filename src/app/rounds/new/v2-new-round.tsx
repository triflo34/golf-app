"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { RoundForm } from "@/components/round-form";
import { ScorecardRoundForm } from "@/components/scorecard-round-form";
import { V2PageShell } from "@/components/v2/page-shell";

type Mode = "type" | "scorecard";

/**
 * Dark-shell wrapper around the existing log-round forms. The inner forms
 * (RoundForm + ScorecardRoundForm) keep their classic light-card styling
 * for now — restyling those is a separate, larger pass.
 */
export function V2NewRound() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<Mode>("type");

  if (authLoading || !user) {
    return (
      <V2PageShell>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="animate-pulse text-[var(--v2-accent)]">Loading…</div>
        </div>
      </V2PageShell>
    );
  }

  return (
    <V2PageShell>
      <h1 className="mb-4 text-2xl font-bold text-[var(--v2-accent)]">
        Log a Round
      </h1>

      <div className="mb-4 flex rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface)] p-0.5 text-sm font-medium">
        <button
          type="button"
          onClick={() => setMode("type")}
          className={`flex-1 rounded-full px-3 py-2 transition ${
            mode === "type"
              ? "bg-[var(--v2-accent)] text-black"
              : "text-[var(--v2-muted)]"
          }`}
        >
          Type scores
        </button>
        <button
          type="button"
          onClick={() => setMode("scorecard")}
          className={`flex-1 rounded-full px-3 py-2 transition ${
            mode === "scorecard"
              ? "bg-[var(--v2-accent)] text-black"
              : "text-[var(--v2-muted)]"
          }`}
        >
          Upload scorecard
        </button>
      </div>

      {mode === "type" ? (
        <RoundForm
          variant="v2"
          submitLabel="Save Round"
          initial={{
            courseId: null,
            playedAt: new Date().toISOString().slice(0, 10),
            notes: "",
            holeCount: 18,
            players: [{ kind: "user", user, gross: "" }],
          }}
          onSubmit={async (payload) => {
            const res = await fetch("/api/rounds", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Save failed");
            router.push("/");
            router.refresh();
          }}
        />
      ) : (
        <ScorecardRoundForm
          me={user}
          onSubmit={async (payload) => {
            const res = await fetch("/api/rounds/scorecard", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Save failed");
            router.push("/");
            router.refresh();
          }}
        />
      )}
    </V2PageShell>
  );
}
