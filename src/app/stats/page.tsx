import { getUiMode } from "@/lib/ui-mode";
import { ClassicStats } from "./classic-stats";
import { V2Stats } from "./v2-stats";

export default async function StatsPage() {
  const mode = await getUiMode();
  return mode === "v2" ? <V2Stats /> : <ClassicStats />;
}
