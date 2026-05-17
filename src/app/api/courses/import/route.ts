import { NextResponse } from "next/server";
import { db, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  GolfCourseApiError,
  fetchCourseDetailExternal,
} from "@/lib/golf-course-api";

/**
 * Imports a course from GolfCourseAPI by external id. If we already have it
 * locally (by external_id), returns the existing local id without re-hitting
 * the API.
 */
export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { external_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const externalId = typeof body.external_id === "string" ? body.external_id.trim() : "";
  if (!externalId) {
    return NextResponse.json({ error: "external_id is required" }, { status: 400 });
  }

  // Already imported? Just return the existing course.
  const existing = await db
    .prepare("SELECT id FROM courses WHERE external_id = ?")
    .get<{ id: number }>(externalId);
  if (existing) {
    return NextResponse.json({ id: existing.id, reused: true });
  }

  let detail;
  try {
    detail = await fetchCourseDetailExternal(externalId);
  } catch (err) {
    const status = err instanceof GolfCourseApiError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Fetch failed";
    return NextResponse.json({ error: message }, { status });
  }

  const totalPar =
    detail.total_par ??
    (detail.holes.length > 0 ? detail.holes.reduce((s, h) => s + h.par, 0) : 72);
  const holeCount = detail.hole_count || detail.holes.length || 18;
  const safeCity = detail.city ?? "Unknown";
  const safeState = detail.state ?? "MI";

  const id = await withTransaction(async (tx) => {
    const inserted = await tx
      .prepare(
        `INSERT INTO courses
           (name, address, city, state, holes, par, latitude, longitude,
            external_id, last_fetched_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, now())
         RETURNING id`,
      )
      .get<{ id: number }>(
        detail.name,
        safeCity,
        safeState,
        holeCount,
        totalPar,
        detail.latitude,
        detail.longitude,
        detail.external_id,
      );
    const courseId = inserted!.id;
    for (const h of detail.holes) {
      await tx
        .prepare(
          `INSERT INTO course_holes (course_id, hole_number, par, handicap_index, yardage)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (course_id, hole_number) DO UPDATE
             SET par = EXCLUDED.par,
                 handicap_index = EXCLUDED.handicap_index,
                 yardage = EXCLUDED.yardage`,
        )
        .run(courseId, h.hole_number, h.par, h.handicap, h.yardage);
    }
    return courseId;
  });

  return NextResponse.json({ id, reused: false });
}
