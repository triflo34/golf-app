import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * Admin rename / edit basic course fields.
 * Body: { name?, city?, state? } — any field omitted is left alone.
 * Use case: a GolfCourseAPI import lands with a weird auto-generated name
 * (e.g. 27-hole layouts come back as "Holes 10-18-21"), and the organizer
 * needs to fix it without re-linking.
 */
export async function PATCH(
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

  let body: { name?: unknown; city?: unknown; state?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const sets: string[] = [];
  const args: string[] = [];

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 120) {
      return NextResponse.json({ error: "name length 2..120" }, { status: 400 });
    }
    sets.push("name = ?");
    args.push(name);
  }
  if (body.city !== undefined) {
    const city = typeof body.city === "string" ? body.city.trim() : "";
    if (city.length < 1 || city.length > 80) {
      return NextResponse.json({ error: "city length 1..80" }, { status: 400 });
    }
    sets.push("city = ?");
    args.push(city);
  }
  if (body.state !== undefined) {
    const state = typeof body.state === "string" ? body.state.trim() : "";
    if (state.length < 1 || state.length > 40) {
      return NextResponse.json({ error: "state length 1..40" }, { status: 400 });
    }
    sets.push("state = ?");
    args.push(state);
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await db
    .prepare(
      `UPDATE courses SET ${sets.join(", ")} WHERE id = ?
       RETURNING id, name, city, state`,
    )
    .get<{ id: number; name: string; city: string; state: string }>(
      ...args,
      courseId,
    );

  if (!updated) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, course: updated });
}
