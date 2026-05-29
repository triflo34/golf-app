import { getUiMode } from "@/lib/ui-mode";
import { ClassicNewLiveRound } from "./classic-new-live-round";
import { V2NewLiveRound } from "./v2-new-live-round";

export default async function NewLiveRoundPage() {
  const mode = await getUiMode();
  return mode === "v2" ? <V2NewLiveRound /> : <ClassicNewLiveRound />;
}
