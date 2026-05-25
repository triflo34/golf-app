import { getUiMode } from "@/lib/ui-mode";
import { ClassicEditRound } from "./classic-edit-round";
import { V2EditRound } from "./v2-edit-round";

export default async function EditRoundPage() {
  const mode = await getUiMode();
  return mode === "v2" ? <V2EditRound /> : <ClassicEditRound />;
}
