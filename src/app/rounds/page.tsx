import { getUiMode } from "@/lib/ui-mode";
import { ClassicRounds } from "./classic-rounds";
import { V2Rounds } from "./v2-rounds";

export default async function RoundsPage() {
  const mode = await getUiMode();
  return mode === "v2" ? <V2Rounds /> : <ClassicRounds />;
}
