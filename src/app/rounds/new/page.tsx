import { getUiMode } from "@/lib/ui-mode";
import { ClassicNewRound } from "./classic-new-round";
import { V2NewRound } from "./v2-new-round";

export default async function NewRoundPage() {
  const mode = await getUiMode();
  return mode === "v2" ? <V2NewRound /> : <ClassicNewRound />;
}
