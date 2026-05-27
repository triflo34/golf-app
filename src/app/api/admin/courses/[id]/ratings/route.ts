import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

type RatingPayload = {
  course_rating?: unknown;
  slope_rating?: unknown;
  front_9_rating?: unknown;
  front_9_slope?: unknown;
  back_9_rating?: unknown;
  back_9_slope?: unknown;
};

const RATING_FIELDS = [
  "course_rating",
  "slope_rating",
  "front_9_rating",
  "front_9_slope",
  "back_9_rating",
  "back_9_slope",
] as const;

type RatingField = (typeof RATING_FIELDS)[number];

function parseRating(field: RatingField, raw: unknown): number | null | "skip" {
  if (raw === undefined) return "skip";
  if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`${field}: must be a number or blank`);
  }
  // USGA: ratings are roughly 25–80, slopes 55–155.
  const isSlope = field.endsWith("slope") || field === "slope_rating";
  if (isSlope) {
    if (n < 55 || n > 200) throw new Error(`${field}: slope must be 55–200`);
  } else {
    if (n < 20 || n > 90) throw new Error(`${field}: rating must be 20–90`);
  }
  return n;
}

/**
 * Admin endpoint to set course ratings + slopes (18-hole and per-nine).
 * Any field omitted is left alone; passing `null` or `""` clears the value.
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

  let body: RatingPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const sets: string[] = [];
  const args: (number | null)[] = [];
  try {
    for (const field of RATING_FIELDS) {
      const parsed = parseRating(field, body[field]);
      if (parsed === "skip") continue;
      sets.push(`${field} = ?`);
      args.push(parsed);
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid rating" },
      { status: 400 },
    );
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await db
    .prepare(
      `UPDATE courses SET ${sets.join(", ")} WHERE id = ?
       RETURNING id, course_rating, slope_rating,
                 front_9_rating, front_9_slope,
                 back_9_rating,  back_9_slope`,
    )
    .get<{
      id: number;
      course_rating: number | null;
      slope_rating: number | null;
      front_9_rating: number | null;
      front_9_slope: number | null;
      back_9_rating: number | null;
      back_9_slope: number | null;
    }>(...args, courseId);

  if (!updated) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, course: updated });
}
