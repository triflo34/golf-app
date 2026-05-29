import { getUiMode } from "@/lib/ui-mode";
import { ClassicLiveRound } from "./classic-live-round";
import { V2LiveRound } from "./v2-live-round";

export default async function LiveRoundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const mode = await getUiMode();
  return mode === "v2" ? <V2LiveRound id={id} /> : <ClassicLiveRound id={id} />;
}
