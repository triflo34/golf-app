import { getUiMode } from "@/lib/ui-mode";
import { ClassicProfile } from "./classic-profile";
import { V2Profile } from "./v2-profile";

export default async function ProfilePage() {
  const mode = await getUiMode();
  return mode === "v2" ? <V2Profile /> : <ClassicProfile />;
}
