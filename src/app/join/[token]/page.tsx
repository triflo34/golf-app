import { getUiMode } from "@/lib/ui-mode";
import { JoinEvent } from "./join-event";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const mode = await getUiMode();
  return <JoinEvent token={token} variant={mode === "v2" ? "v2" : "classic"} />;
}
