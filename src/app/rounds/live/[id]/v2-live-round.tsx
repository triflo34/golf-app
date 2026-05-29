"use client";

import { LiveRoundView } from "@/components/live-round-view";

export function V2LiveRound({ id }: { id: string }) {
  const rid = Number(id);
  if (!Number.isInteger(rid)) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6 text-sm text-red-400">
        Invalid round id
      </div>
    );
  }
  return <LiveRoundView roundId={rid} variant="v2" />;
}
