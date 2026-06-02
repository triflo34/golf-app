import { getUiMode } from "@/lib/ui-mode";
import { ClassicPoker } from "./classic-poker";
import { V2Poker } from "./v2-poker";

export default async function PokerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const mode = await getUiMode();
  return mode === "v2" ? <V2Poker id={id} /> : <ClassicPoker id={id} />;
}
