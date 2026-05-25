import { getUiMode } from "@/lib/ui-mode";
import { ClassicRegister } from "./classic-register";
import { V2Register } from "./v2-register";

export default async function RegisterPage() {
  const mode = await getUiMode();
  return mode === "v2" ? <V2Register /> : <ClassicRegister />;
}
