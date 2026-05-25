import { getUiMode } from "@/lib/ui-mode";
import { ClassicEvents } from "./classic-events";
import { V2Events } from "./v2-events";

export default async function EventsPage() {
  const mode = await getUiMode();
  return mode === "v2" ? <V2Events /> : <ClassicEvents />;
}
