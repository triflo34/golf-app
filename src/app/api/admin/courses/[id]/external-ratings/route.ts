import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  GolfCourseApiError,
  fetchCourseDetailExternal,
} from "@/lib/golf-course-api";

/**
 * Admin preview: fetch a course's rating/slope from GolfCourseAPI and return
 * them WITHOUT persisting. The course-edit page uses this to fill the rating
 * inputs so the admin can review (and tweak) before saving via the existing
 * `PATCH /api/admin/courses/[id]/ratings` endpoint.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!me.is_admin) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await params;
  const courseId = Number(id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: "Invalid course id" }, { status: 400 });
  }

  const course = await db
    .prepare("SELECT external_id FROM courses WHERE id = ?")
    .get<{ external_id: string | null }>(courseId);
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  if (!course.external_id) {
    return NextResponse.json(
      { error: "Course wasn't imported from GolfCourseAPI" },
      { status: 400 },
    );
  }

  let detail;
  try {
    detail = await fetchCourseDetailExternal(course.external_id);
  } catch (err) {
    const status = err instanceof GolfCourseApiError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Fetch failed";
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({
    tee_name: detail.tee_name,
    course_rating: detail.course_rating,
    slope_rating: detail.slope_rating,
    front_9_rating: detail.front_9_rating,
    front_9_slope: detail.front_9_slope,
    back_9_rating: detail.back_9_rating,
    back_9_slope: detail.back_9_slope,
  });
}
