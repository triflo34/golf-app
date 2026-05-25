import { getUiMode } from "@/lib/ui-mode";
import { ClassicLogin } from "./classic-login";
import { V2Login } from "./v2-login";

export default async function LoginPage() {
  const mode = await getUiMode();
  return mode === "v2" ? <V2Login /> : <ClassicLogin />;
}
