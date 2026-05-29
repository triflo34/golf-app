"use client";

import { LiveRoundView } from "@/components/live-round-view";

export function ClassicLiveRound({ id }: { id: string }) {
  const rid = Number(id);
  if (!Number.isInteger(rid)) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6 text-sm text-red-600">
        Invalid round id
      </div>
    );
  }
  return <LiveRoundView roundId={rid} variant="classic" />;
}
