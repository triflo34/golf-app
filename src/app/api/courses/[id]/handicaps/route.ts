import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  calculateCourseHandicap,
  type HandicapIndexResult,
} from "@/lib/handicap";
import { getPlayerHandicapIndexes } from "@/lib/player-handicap";

type CourseRow = {
  par: number;
  course_rating: number | null;
  slope_rating: number | null;
  front_9_rating: number | null;
  front_9_slope: number | null;
  back_9_rating: number | null;
  back_9_slope: number | null;
};

export type PlayerCourseHandicap = {
  handicap_index: number | null;
  course_handicap: number | null;
  rounds_used: number;
};

export type CourseHandicapsResponse = {
  hole_count: 9 | 18;
  nine_played: "front" | "back" | null;
  by_user_id: Record<string, PlayerCourseHandicap>;
};

/**
 * GET /api/courses/[id]/handicaps?user_ids=u1,u2,u3&hole_count=18&nine_played=front
 *
 * Returns each user's current handicap index plus the course handicap they
 * would receive on this course for the requested format. `course_handicap`
 * is null when either the user has no index yet or the course is missing
 * the rating/slope needed for the requested format.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: idParam } = await params;
  const courseId = Number(idParam);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: "Bad course id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const userIds = (url.searchParams.get("user_ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const holeCountParam = url.searchParams.get("hole_count");
  const ninePlayedParam = url.searchParams.get("nine_played");

  const holeCount: 9 | 18 = holeCountParam === "9" ? 9 : 18;
  const ninePlayed: "front" | "back" | null =
    ninePlayedParam === "front" || ninePlayedParam === "back"
      ? ninePlayedParam
      : null;

  const course = await db
    .prepare(
      `SELECT par, course_rating, slope_rating,
              front_9_rating, front_9_slope,
              back_9_rating,  back_9_slope
       FROM courses WHERE id = ?`,
    )
    .get<CourseRow>(courseId);
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const indexes = await getPlayerHandicapIndexes(userIds);
  const by_user_id: Record<string, PlayerCourseHandicap> = {};
  for (const uid of userIds) {
    const hc: HandicapIndexResult = indexes.get(uid) ?? {
      index: null,
      rounds_used: 0,
      rounds_skipped: 0,
      best_n: 0,
      adjustment: 0,
    };
    const courseHandicap =
      hc.index == null
        ? null
        : calculateCourseHandicap(hc.index, course, holeCount, ninePlayed);
    by_user_id[uid] = {
      handicap_index: hc.index,
      course_handicap: courseHandicap,
      rounds_used: hc.rounds_used,
    };
  }

  return NextResponse.json({
    hole_count: holeCount,
    nine_played: ninePlayed,
    by_user_id,
  } satisfies CourseHandicapsResponse);
}
