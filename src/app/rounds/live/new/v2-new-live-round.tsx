"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { LiveRoundSetup } from "@/components/live-round-setup";

export function V2NewLiveRound() {
  const { user, loading } = useAuth();

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--v2-bg)]">
        <div className="animate-pulse text-[var(--v2-accent)] text-lg">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--v2-bg)] text-white">
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href="/" className="text-sm text-[var(--v2-accent)] font-medium">
          ← Home
        </Link>
        <h1 className="text-2xl font-bold mt-2 mb-1">Start Live Round</h1>
        <p className="text-sm text-[var(--v2-muted)] mb-4">
          Score hole-by-hole with everyone on the leaderboard in real time. Tap
          Finish when you&apos;re done.
        </p>
        <LiveRoundSetup me={user} variant="v2" />
      </div>
    </div>
  );
}
