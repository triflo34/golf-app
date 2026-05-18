import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * Admin per-hole par/handicap/yardage override.
 * Body: { hole_number, par?, handicap_index?, yardage? }
 * Any field omitted is left untouched. Pass null to clear handicap or yardage.
 * par cannot be null (must be 3-6). Updates course_holes only; existing
 * hole_scores keep their snapshot values (won't retroactively shift past rounds).
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

  let body: {
    hole_number?: unknown;
    par?: unknown;
    handicap_index?: unknown;
    yardage?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const holeNumber = Number(body.hole_number);
  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    return NextResponse.json({ error: "hole_number must be 1–18" }, { status: 400 });
  }

  const setFragments: string[] = [];
  const args: (number | null)[] = [];

  if (body.par !== undefined) {
    const par = Number(body.par);
    if (!Number.isInteger(par) || par < 3 || par > 6) {
      return NextResponse.json({ error: "par must be 3–6" }, { status: 400 });
    }
    setFragments.push("par = ?");
    args.push(par);
  }
  if (body.handicap_index !== undefined) {
    if (body.handicap_index === null) {
      setFragments.push("handicap_index = NULL");
    } else {
      const hi = Number(body.handicap_index);
      if (!Number.isInteger(hi) || hi < 1 || hi > 18) {
        return NextResponse.json(
          { error: "handicap_index must be 1–18 or null" },
          { status: 400 },
        );
      }
      setFragments.push("handicap_index = ?");
      args.push(hi);
    }
  }
  if (body.yardage !== undefined) {
    if (body.yardage === null) {
      setFragments.push("yardage = NULL");
    } else {
      const yd = Number(body.yardage);
      if (!Number.isInteger(yd) || yd < 30 || yd > 800) {
        return NextResponse.json(
          { error: "yardage must be 30–800 or null" },
          { status: 400 },
        );
      }
      setFragments.push("yardage = ?");
      args.push(yd);
    }
  }

  if (setFragments.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const result = await db
    .prepare(
      `UPDATE course_holes
         SET ${setFragments.join(", ")}
       WHERE course_id = ? AND hole_number = ?
       RETURNING hole_number, par, handicap_index, yardage`,
    )
    .get<{
      hole_number: number;
      par: number;
      handicap_index: number | null;
      yardage: number | null;
    }>(...args, courseId, holeNumber);

  if (!result) {
    return NextResponse.json(
      { error: "Hole not found — does this course have per-hole rows yet?" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, hole: result });
}
