import { getUiMode } from "@/lib/ui-mode";
import { ClassicEventManage } from "./classic-manage";
import { V2EventManage } from "./v2-manage";

export default async function EventManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const mode = await getUiMode();
  return mode === "v2" ? <V2EventManage id={id} /> : <ClassicEventManage id={id} />;
}
