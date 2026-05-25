import { getUiMode } from "@/lib/ui-mode";
import { ClassicCourseDetail } from "./classic-course-detail";
import { V2CourseDetail } from "./v2-course-detail";

export default async function CourseDetailPage() {
  const mode = await getUiMode();
  return mode === "v2" ? <V2CourseDetail /> : <ClassicCourseDetail />;
}
