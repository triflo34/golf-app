import { getUiMode } from "@/lib/ui-mode";
import { ClassicRound } from "./classic-round";
import { V2Round } from "./v2-round";

export default async function RoundPage() {
  const mode = await getUiMode();
  return mode === "v2" ? <V2Round /> : <ClassicRound />;
}
