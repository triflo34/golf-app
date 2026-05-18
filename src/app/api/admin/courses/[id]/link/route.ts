import { NextResponse } from "next/server";
import { db, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  GolfCourseApiError,
  fetchCourseDetailExternal,
} from "@/lib/golf-course-api";

/**
 * Re-link a locally-created course (no external_id) to a GolfCourseAPI entry.
 * Fetches the external detail and replaces per-hole rows + key course fields.
 * Used to upgrade legacy/manually-seeded courses (where course_holes defaulted
 * to all par-4s) into ones backed by real per-hole pars.
 *
 * If the course already has an external_id, refuses unless the caller is
 * intentionally re-linking to a different one (we still allow it — admin only).
 */
export async function POST(
  request: Request,
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

  let body: { external_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const externalId =
    typeof body.external_id === "string" ? body.external_id.trim() : "";
  if (!externalId) {
    return NextResponse.json(
      { error: "external_id is required" },
      { status: 400 },
    );
  }

  const course = await db
    .prepare("SELECT id FROM courses WHERE id = ?")
    .get<{ id: number }>(courseId);
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  // Another local course already uses this external_id? Refuse — would create
  // duplicate links and break the existing import-reuse path.
  const conflict = await db
    .prepare(
      "SELECT id FROM courses WHERE external_id = ? AND id <> ?",
    )
    .get<{ id: number }>(externalId, courseId);
  if (conflict) {
    return NextResponse.json(
      {
        error: `Another course (id ${conflict.id}) is already linked to that external_id`,
      },
      { status: 409 },
    );
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
    (detail.holes.length > 0
      ? detail.holes.reduce((s, h) => s + h.par, 0)
      : null);

  await withTransaction(async (tx) => {
    await tx
      .prepare(
        `UPDATE courses SET
           external_id = ?,
           name = ?,
           city = COALESCE(?, city),
           state = COALESCE(?, state),
           holes = ?,
           par = COALESCE(?, par),
           latitude = COALESCE(?, latitude),
           longitude = COALESCE(?, longitude),
           last_fetched_at = now()
         WHERE id = ?`,
      )
      .run(
        detail.external_id,
        detail.name,
        detail.city,
        detail.state,
        detail.hole_count,
        totalPar,
        detail.latitude,
        detail.longitude,
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
