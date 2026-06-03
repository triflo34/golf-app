import { getUiMode } from "@/lib/ui-mode";
import { ClassicAdmin } from "./classic-admin";
import { V2Admin } from "./v2-admin";

export default async function AdminPage() {
  const mode = await getUiMode();
  return mode === "v2" ? <V2Admin /> : <ClassicAdmin />;
}
