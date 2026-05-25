import { getUiMode } from "@/lib/ui-mode";
import { ClassicNewEvent } from "./classic-new-event";
import { V2NewEvent } from "./v2-new-event";

export default async function NewEventPage() {
  const mode = await getUiMode();
  return mode === "v2" ? <V2NewEvent /> : <ClassicNewEvent />;
}
