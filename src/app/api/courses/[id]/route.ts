import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { Course } from "@/lib/types";

export type CourseHoleDetail = {
  hole_number: number;
  par: number;
  handicap_index: number | null;
  yardage: number | null;
};

export type CourseDetail = {
  course: Course;
  rounds_played: number;
  holes: CourseHoleDetail[];
  is_favorite: boolean;
  top_scores: {
    name: string;
    is_guest: boolean;
    gross_score: number;
    played_at: string;
  }[];
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const course = await db
    .prepare("SELECT * FROM courses WHERE id = ?")
    .get<Course>(id);
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const roundCount = await db
    .prepare("SELECT COUNT(*)::int as n FROM rounds WHERE course_id = ?")
    .get<{ n: number }>(id);

  const holes = await db
    .prepare(
      `SELECT hole_number, par, handicap_index, yardage FROM course_holes
       WHERE course_id = ? ORDER BY hole_number ASC`,
    )
    .all<CourseHoleDetail>(id);

  // favorite_courses may not exist yet on environments where the migration
  // hasn't run (Vercel Prod has SKIP_DB_BOOTSTRAP=1). Degrade gracefully.
  let favRow: { ok: number } | null = null;
  try {
    favRow = (await db
      .prepare(
        "SELECT 1 AS ok FROM favorite_courses WHERE user_id = ? AND course_id = ?",
      )
      .get<{ ok: number }>(me.id, id)) ?? null;
  } catch (err) {
    console.warn("[courses/[id]] favorite_courses query failed:", err);
  }

  const topScoreRows = await db
    .prepare(
      `SELECT s.gross_score, s.guest_name, u.display_name, r.played_at
       FROM scores s
       JOIN rounds r ON r.id = s.round_id
       LEFT JOIN users u ON u.id = s.player_id
       WHERE r.course_id = ?
       ORDER BY s.gross_score ASC, r.played_at DESC
       LIMIT 10`,
    )
    .all<{
      gross_score: number;
      guest_name: string | null;
      display_name: string | null;
      played_at: string;
    }>(id);

  const top_scores = topScoreRows.map((s) => ({
    name: s.display_name ?? s.guest_name ?? "?",
    is_guest: !s.display_name,
    gross_score: s.gross_score,
    played_at: s.played_at,
  }));

  return NextResponse.json({
    course,
    rounds_played: roundCount?.n ?? 0,
    holes,
    is_favorite: Boolean(favRow),
    top_scores,
  } satisfies CourseDetail);
}
