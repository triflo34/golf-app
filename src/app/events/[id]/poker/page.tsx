import { getUiMode } from "@/lib/ui-mode";
import { ClassicPoker } from "./classic-poker";
import { V2Poker } from "./v2-poker";

export default async function PokerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ round?: string }>;
}) {
  const { id } = await params;
  const { round } = await searchParams;
  const mode = await getUiMode();
  return mode === "v2" ? (
    <V2Poker id={id} backRound={round} />
  ) : (
    <ClassicPoker id={id} backRound={round} />
  );
}
