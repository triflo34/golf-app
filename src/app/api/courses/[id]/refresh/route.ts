import { NextResponse } from "next/server";
import { db, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  GolfCourseApiError,
  fetchCourseDetailExternal,
} from "@/lib/golf-course-api";

/**
 * Re-pulls per-hole pars/yardages from GolfCourseAPI for any course that was
 * imported with an external_id. Any signed-in user can trigger this — the
 * external API is read-only and cheap; the worst case is wasted quota on the
 * free tier, which is acceptable given the app's size.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const courseId = Number(id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: "Invalid course id" }, { status: 400 });
  }

  const course = await db
    .prepare("SELECT id, external_id FROM courses WHERE id = ?")
    .get<{ id: number; external_id: string | null }>(courseId);
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  if (!course.external_id) {
    return NextResponse.json(
      { error: "Course has no external_id — wasn't imported from GolfCourseAPI" },
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

  const totalPar =
    detail.total_par ??
    (detail.holes.length > 0 ? detail.holes.reduce((s, h) => s + h.par, 0) : null);

  await withTransaction(async (tx) => {
    await tx
      .prepare(
        `UPDATE courses SET
           name = ?,
           city = COALESCE(?, city),
           state = COALESCE(?, state),
           holes = ?,
           par = COALESCE(?, par),
           latitude = COALESCE(?, latitude),
           longitude = COALESCE(?, longitude),
           course_rating  = COALESCE(?, course_rating),
           slope_rating   = COALESCE(?, slope_rating),
           front_9_rating = COALESCE(?, front_9_rating),
           front_9_slope  = COALESCE(?, front_9_slope),
           back_9_rating  = COALESCE(?, back_9_rating),
           back_9_slope   = COALESCE(?, back_9_slope),
           last_fetched_at = now()
         WHERE id = ?`,
      )
      .run(
        detail.name,
        detail.city,
        detail.state,
        detail.hole_count,
        totalPar,
        detail.latitude,
        detail.longitude,
        detail.course_rating,
        detail.slope_rating,
        detail.front_9_rating,
        detail.front_9_slope,
        detail.back_9_rating,
        detail.back_9_slope,
        courseId,
      );

    await tx
      .prepare("DELETE FROM course_holes WHERE course_id = ?")
      .run(courseId);
    for (const h of detail.holes) {
      await tx
        .prepare(
          `INSERT INTO course_holes (course_id, hole_number, par, handicap_index, yardage)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(courseId, h.hole_number, h.par, h.handicap, h.yardage);
    }
  });

  return NextResponse.json({ ok: true, holes: detail.holes.length });
}
