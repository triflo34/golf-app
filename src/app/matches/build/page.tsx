import { getUiMode } from "@/lib/ui-mode";
import { MatchBuilder } from "./match-builder";

export default async function MatchBuilderPage() {
  const mode = await getUiMode();
  return <MatchBuilder variant={mode} />;
}
