"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { RoundForm } from "@/components/round-form";
import { ScorecardRoundForm } from "@/components/scorecard-round-form";

type Mode = "type" | "scorecard";

export default function NewRoundPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<Mode>("type");

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-green-700 text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-green-800 mb-4">Log a Round</h1>

      <div className="mb-4 flex bg-gray-100 rounded-lg p-0.5 text-sm font-medium">
        <button
          type="button"
          onClick={() => setMode("type")}
          className={`flex-1 px-3 py-2 rounded transition ${
            mode === "type"
              ? "bg-white text-green-700 shadow-sm"
              : "text-gray-500"
          }`}
        >
          Type scores
        </button>
        <button
          type="button"
          onClick={() => setMode("scorecard")}
          className={`flex-1 px-3 py-2 rounded transition ${
            mode === "scorecard"
              ? "bg-white text-green-700 shadow-sm"
              : "text-gray-500"
          }`}
        >
          Upload scorecard
        </button>
      </div>

      {mode === "type" ? (
        <RoundForm
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
    </div>
  );
}
