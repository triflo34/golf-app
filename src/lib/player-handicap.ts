import { db } from "@/lib/db";
import {
  calculateCourseHandicap,
  calculateDifferentialWithMeta,
  calculateHandicapIndex,
  type HandicapIndexResult,
  type RoundForHandicap,
} from "@/lib/handicap";

export type HandicapRoundDetail = {
  round_id: number;
  played_at: string;
  course_name: string;
  hole_count: 9 | 18;
  nine_played: "front" | "back" | null;
  gross_score: number;
  /** Differential used in the index (null if the round was skipped). */
  differential: number | null;
  /** True when 9-hole rating was missing and we derived it from the 18-hole. */
  estimated: boolean;
  skip_reason: "missing_18_rating" | "missing_9_rating" | null;
  /** True when this round's differential is in the best-N average. */
  used_in_index: boolean;
};

export type HandicapDetails = {
  summary: HandicapIndexResult;
  rounds: HandicapRoundDetail[];
};

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
       WHERE s.player_id = ? AND r.excluded = FALSE
       ORDER BY r.played_at ASC, r.id ASC`,
    )
    .all<RoundRow>(userId);

  return calculateHandicapIndex(rows.map(toRoundForHandicap));
}

/**
 * Same as `getPlayerHandicapIndex` but also returns a per-round breakdown:
 * each of the last 20 rounds, its differential (or null + skip reason), and
 * whether it landed in the best-N average. Used for diagnostic UI so a player
 * can see why their index is what it is.
 */
export async function getPlayerHandicapDetails(
  userId: string,
): Promise<HandicapDetails> {
  const rows = await db
    .prepare(
      `SELECT r.id           AS round_id,
              r.played_at,
              c.name         AS course_name,
              s.gross_score,
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
       WHERE s.player_id = ? AND r.excluded = FALSE
       ORDER BY r.played_at ASC, r.id ASC`,
    )
    .all<
      RoundRow & {
        round_id: number;
        played_at: string;
        course_name: string;
      }
    >(userId);

  const recent = rows.slice(-20);
  const summary = calculateHandicapIndex(recent.map(toRoundForHandicap));

  // Collect each round's differential (or skip reason) and figure out which
  // best-N diffs got averaged. We rebuild the same sort as the index calc.
  const enriched = recent.map((r) => {
    const round = toRoundForHandicap(r);
    const { differential, estimated } = calculateDifferentialWithMeta(round);
    let skipReason: HandicapRoundDetail["skip_reason"] = null;
    if (differential == null) {
      skipReason = round.hole_count === 18 ? "missing_18_rating" : "missing_9_rating";
    }
    return {
      round_id: r.round_id,
      played_at: r.played_at,
      course_name: r.course_name,
      hole_count: round.hole_count,
      nine_played: round.nine_played,
      gross_score: r.gross_score,
      differential,
      estimated,
      skip_reason: skipReason,
    };
  });

  const usedDiffs = enriched
    .filter((e) => e.differential != null)
    .map((e) => ({ id: e.round_id, diff: e.differential as number }))
    .sort((a, b) => a.diff - b.diff)
    .slice(0, summary.best_n)
    .map((e) => e.id);
  const usedSet = new Set(usedDiffs);

  const rounds: HandicapRoundDetail[] = enriched.map((e) => ({
    round_id: e.round_id,
    played_at: e.played_at,
    course_name: e.course_name,
    hole_count: e.hole_count,
    nine_played: e.nine_played,
    gross_score: e.gross_score,
    differential:
      e.differential == null ? null : Math.round(e.differential * 10) / 10,
    estimated: e.estimated,
    skip_reason: e.skip_reason,
    used_in_index: usedSet.has(e.round_id),
  }));

  // Newest first for display.
  rounds.reverse();

  return { summary, rounds };
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
       WHERE s.player_id IN (${placeholders}) AND r.excluded = FALSE
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
