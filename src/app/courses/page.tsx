import { getUiMode } from "@/lib/ui-mode";
import { ClassicCourses } from "./classic-courses";
import { V2Courses } from "./v2-courses";

export default async function CoursesPage() {
  const mode = await getUiMode();
  return mode === "v2" ? <V2Courses /> : <ClassicCourses />;
}
