import { getUiMode } from "@/lib/ui-mode";
import { ClassicEventScorecard } from "./classic-scorecard";
import { V2EventScorecard } from "./v2-scorecard";

export default async function ScorecardPage({
  params,
}: {
  params: Promise<{ id: string; roundId: string }>;
}) {
  const { id, roundId } = await params;
  const mode = await getUiMode();
  return mode === "v2" ? (
    <V2EventScorecard id={id} roundId={roundId} />
  ) : (
    <ClassicEventScorecard id={id} roundId={roundId} />
  );
}
