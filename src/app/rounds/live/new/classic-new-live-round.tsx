"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { LiveRoundSetup } from "@/components/live-round-setup";

export function ClassicNewLiveRound() {
  const { user, loading } = useAuth();

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-green-700 text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <Link href="/" className="text-sm text-green-700 font-medium">
        ← Home
      </Link>
      <h1 className="text-2xl font-bold text-green-800 mt-2 mb-1">
        Start Live Round
      </h1>
      <p className="text-sm text-gray-600 mb-4">
        Score hole-by-hole with everyone on the leaderboard in real time. Tap
        Finish when you&apos;re done.
      </p>
      <LiveRoundSetup me={user} variant="classic" />
    </div>
  );
}
