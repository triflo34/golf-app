"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { RoundForm } from "@/components/round-form";

export default function NewRoundPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

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
    </div>
  );
}
