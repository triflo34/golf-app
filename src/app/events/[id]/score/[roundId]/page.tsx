import { getUiMode } from "@/lib/ui-mode";
import { ClassicEventScore } from "./classic-score";
import { V2EventScore } from "./v2-score";

export default async function ScorePage({
  params,
}: {
  params: Promise<{ id: string; roundId: string }>;
}) {
  const { id, roundId } = await params;
  const mode = await getUiMode();
  return mode === "v2" ? (
    <V2EventScore id={id} roundId={roundId} />
  ) : (
    <ClassicEventScore id={id} roundId={roundId} />
  );
}
