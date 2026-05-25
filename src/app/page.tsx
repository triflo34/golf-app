import { getUiMode } from "@/lib/ui-mode";
import { ClassicHome } from "./classic-home";
import { V2Home } from "./v2-home";

export default async function HomePage() {
  const mode = await getUiMode();
  return mode === "v2" ? <V2Home /> : <ClassicHome />;
}
