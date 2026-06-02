import { getUiMode } from "@/lib/ui-mode";
import { ClassicEventDetail } from "./classic-event-detail";
import { V2EventDetail } from "./v2-event-detail";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const mode = await getUiMode();
  return mode === "v2" ? <V2EventDetail id={id} /> : <ClassicEventDetail id={id} />;
}
