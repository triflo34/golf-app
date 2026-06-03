import { getUiMode } from "@/lib/ui-mode";
import { ClassicEditHoles } from "./classic-edit-holes";
import { V2EditHoles } from "./v2-edit-holes";

export default async function EditHolesPage() {
  const mode = await getUiMode();
  return mode === "v2" ? <V2EditHoles /> : <ClassicEditHoles />;
}
