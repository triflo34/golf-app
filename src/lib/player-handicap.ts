import { db } from "@/lib/db";
import {
  calculateCourseHandicap,
  calculateHandicapIndex,
  type HandicapIndexResult,
  type RoundForHandicap,
} from "@/lib/handicap";

type RoundRow = {
  gross_score: number;
  hole_count: number;
  nine_played: string | null;
  course_rating: number | null;
  slope_rating: number | null;
  front_9_rating: number | null;
  front_9_slope: number | null;
  back_9_rating: number | null;
  back_9_slope: number | null;
};

function toRoundForHandicap(r: RoundRow): RoundForHandicap {
  return {
    gross_score: r.gross_score,
    hole_count: r.hole_count === 9 ? 9 : 18,
    nine_played:
      r.nine_played === "front" || r.nine_played === "back"
        ? r.nine_played
        : null,
    course_rating: r.course_rating,
    slope_rating: r.slope_rating,
    front_9_rating: r.front_9_rating,
    front_9_slope: r.front_9_slope,
    back_9_rating: r.back_9_rating,
    back_9_slope: r.back_9_slope,
  };
}

/**
 * Compute the current handicap index for a registered user from their
 * historical scores. Guest scores are not aggregated (they don't have a
 * user id to attach an index to).
 */
export async function getPlayerHandicapIndex(
  userId: string,
): Promise<HandicapIndexResult> {
  const rows = await db
    .prepare(
      `SELECT s.gross_score,
              r.hole_count,
              r.nine_played,
              c.course_rating,
              c.slope_rating,
              c.front_9_rating,
              c.front_9_slope,
              c.back_9_rating,
              c.back_9_slope
       FROM scores s
       JOIN rounds r  ON r.id = s.round_id
       JOIN courses c ON c.id = r.course_id
       WHERE s.player_id = ?
       ORDER BY r.played_at ASC, r.id ASC`,
    )
    .all<RoundRow>(userId);

  return calculateHandicapIndex(rows.map(toRoundForHandicap));
}

/**
 * Convenience: fetch a course's rating data once and compute a course
 * handicap for a known handicap index. Returns null if either the index
 * is unknown or the course is missing the rating/slope it needs.
 */
export async function getCourseHandicapForIndex(
  handicapIndex: number,
  courseId: number,
  holeCount: 9 | 18,
  ninePlayed: "front" | "back" | null,
): Promise<number | null> {
  const course = await db
    .prepare(
      `SELECT par, course_rating, slope_rating,
              front_9_rating, front_9_slope,
              back_9_rating,  back_9_slope
       FROM courses WHERE id = ?`,
    )
    .get<{
      par: number;
      course_rating: number | null;
      slope_rating: number | null;
      front_9_rating: number | null;
      front_9_slope: number | null;
      back_9_rating: number | null;
      back_9_slope: number | null;
    }>(courseId);
  if (!course) return null;
  return calculateCourseHandicap(handicapIndex, course, holeCount, ninePlayed);
}

/**
 * Batch helper: compute indexes for many users in a single query. Returns
 * a map of user_id → HandicapIndexResult. Users with no scores are absent
 * from the map (caller can default to `{ index: null, ... }`).
 */
export async function getPlayerHandicapIndexes(
  userIds: string[],
): Promise<Map<string, HandicapIndexResult>> {
  const out = new Map<string, HandicapIndexResult>();
  if (userIds.length === 0) return out;
  const placeholders = userIds.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT s.player_id,
              s.gross_score,
              r.hole_count,
              r.nine_played,
              r.played_at,
              r.id AS round_id,
              c.course_rating,
              c.slope_rating,
              c.front_9_rating,
              c.front_9_slope,
              c.back_9_rating,
              c.back_9_slope
       FROM scores s
       JOIN rounds r  ON r.id = s.round_id
       JOIN courses c ON c.id = r.course_id
       WHERE s.player_id IN (${placeholders})
       ORDER BY s.player_id, r.played_at ASC, r.id ASC`,
    )
    .all<RoundRow & { player_id: string; played_at: string; round_id: number }>(
      ...userIds,
    );

  const byUser = new Map<string, RoundRow[]>();
  for (const row of rows) {
    const arr = byUser.get(row.player_id) ?? [];
    arr.push(row);
    byUser.set(row.player_id, arr);
  }
  for (const [uid, userRows] of byUser) {
    out.set(uid, calculateHandicapIndex(userRows.map(toRoundForHandicap)));
  }
  return out;
}
