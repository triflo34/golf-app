import { getUiMode } from "@/lib/ui-mode";
import { ClassicNewCourse } from "./classic-new-course";
import { V2NewCourse } from "./v2-new-course";

export default async function NewCoursePage() {
  const mode = await getUiMode();
  return mode === "v2" ? <V2NewCourse /> : <ClassicNewCourse />;
}
