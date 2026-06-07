import { getUiMode } from "@/lib/ui-mode";
import { V2PlayerProfileFull, ClassicPlayerProfileFull } from "@/components/player-profile-full";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const mode = await getUiMode();
  return mode === "v2" ? (
    <V2PlayerProfileFull playerId={id} />
  ) : (
    <ClassicPlayerProfileFull playerId={id} />
  );
}
