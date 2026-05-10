import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { Course } from "@/lib/types";

export type CourseDetail = {
  course: Course;
  rounds_played: number;
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

  const course = db
    .prepare("SELECT * FROM courses WHERE id = ?")
    .get(id) as Course | undefined;
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const roundCount = db
    .prepare("SELECT COUNT(*) as n FROM rounds WHERE course_id = ?")
    .get(id) as { n: number };

  const topScoreRows = db
    .prepare(
      `SELECT s.gross_score, s.guest_name, u.display_name, r.played_at
       FROM scores s
       JOIN rounds r ON r.id = s.round_id
       LEFT JOIN users u ON u.id = s.player_id
       WHERE r.course_id = ?
       ORDER BY s.gross_score ASC, r.played_at DESC
       LIMIT 10`,
    )
    .all(id) as Array<{
    gross_score: number;
    guest_name: string | null;
    display_name: string | null;
    played_at: string;
  }>;

  const top_scores = topScoreRows.map((s) => ({
    name: s.display_name ?? s.guest_name ?? "?",
    is_guest: !s.display_name,
    gross_score: s.gross_score,
    played_at: s.played_at,
  }));

  return NextResponse.json({
    course,
    rounds_played: roundCount.n,
    top_scores,
  } satisfies CourseDetail);
}
