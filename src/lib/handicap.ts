/**
 * USGA-style Handicap Index calculation (simplified, internal — no GHIN).
 *
 * 18-hole differential: ((score - rating) * 113) / slope
 * 9-hole differential:  ((score - rating9) * 113) / slope9, then *2 to express
 *                       as an 18-hole-equivalent. A 9-hole round needs both
 *                       the relevant nine's rating/slope (front or back) and
 *                       the round's `nine_played` value, else it is skipped.
 *
 * Index = average of best N differentials out of last 20 rounds:
 *
 *   Rounds | Use best
 *   3      | 1
 *   4      | 1
 *   5      | 1
 *   6      | 2
 *   7-8    | 2
 *   9-10   | 3
 *   11-12  | 4
 *   13-14  | 5
 *   15-16  | 6
 *   17     | 7
 *   18-20  | 8
 */

export type RoundForHandicap = {
  gross_score: number;
  hole_count: 9 | 18;
  // 18-hole rating/slope. Required for 18-hole rounds; for 9-hole rounds this
  // is ignored.
  course_rating: number | null;
  slope_rating: number | null;
  // 9-hole nine identifier (set only when hole_count = 9). NULL on legacy
  // 9-hole rounds — caller decides whether to default to 'front'.
  nine_played: "front" | "back" | null;
  front_9_rating: number | null;
  front_9_slope: number | null;
  back_9_rating: number | null;
  back_9_slope: number | null;
};

function bestNCount(totalRounds: number): number {
  if (totalRounds <= 5) return 1;
  if (totalRounds <= 8) return 2;
  if (totalRounds <= 10) return 3;
  if (totalRounds <= 12) return 4;
  if (totalRounds <= 14) return 5;
  if (totalRounds <= 16) return 6;
  if (totalRounds === 17) return 7;
  return 8; // 18-20
}

/**
 * Returns the 18-hole-equivalent differential for a round, or null if the
 * round is missing the rating/slope it needs.
 */
export function calculateDifferential(round: RoundForHandicap): number | null {
  if (round.hole_count === 18) {
    if (round.course_rating == null || round.slope_rating == null) return null;
    return ((round.gross_score - round.course_rating) * 113) / round.slope_rating;
  }
  // 9-hole
  const nine = round.nine_played ?? "front";
  const rating = nine === "front" ? round.front_9_rating : round.back_9_rating;
  const slope = nine === "front" ? round.front_9_slope : round.back_9_slope;
  if (rating == null || slope == null) return null;
  const half = ((round.gross_score - rating) * 113) / slope;
  return half * 2;
}

export type HandicapIndexResult = {
  index: number | null;
  rounds_used: number;
  rounds_skipped: number;
};

export function calculateHandicapIndex(
  rounds: RoundForHandicap[],
): HandicapIndexResult {
  const recent = rounds.slice(-20);

  const diffs: number[] = [];
  let skipped = 0;
  for (const r of recent) {
    const d = calculateDifferential(r);
    if (d == null) skipped += 1;
    else diffs.push(d);
  }

  if (diffs.length < 3) {
    return { index: null, rounds_used: diffs.length, rounds_skipped: skipped };
  }

  diffs.sort((a, b) => a - b);
  const bestN = bestNCount(diffs.length);
  const bestDiffs = diffs.slice(0, bestN);
  const avg = bestDiffs.reduce((sum, d) => sum + d, 0) / bestDiffs.length;
  const index = Math.round(avg * 10) / 10;

  return { index, rounds_used: diffs.length, rounds_skipped: skipped };
}

/**
 * Course handicap = handicap_index * (slope / 113) + (rating - par)
 *
 * For 9-hole rounds, uses the relevant nine's rating/slope and the 9-hole
 * par (half of the course par). Returns null if the required rating/slope
 * for this course+format is missing.
 */
export function calculateCourseHandicap(
  handicapIndex: number,
  course: {
    par: number;
    course_rating: number | null;
    slope_rating: number | null;
    front_9_rating: number | null;
    front_9_slope: number | null;
    back_9_rating: number | null;
    back_9_slope: number | null;
  },
  holeCount: 9 | 18,
  ninePlayed: "front" | "back" | null,
): number | null {
  if (holeCount === 18) {
    if (course.course_rating == null || course.slope_rating == null) return null;
    return Math.round(
      handicapIndex * (course.slope_rating / 113) + (course.course_rating - course.par),
    );
  }
  const nine = ninePlayed ?? "front";
  const rating = nine === "front" ? course.front_9_rating : course.back_9_rating;
  const slope = nine === "front" ? course.front_9_slope : course.back_9_slope;
  if (rating == null || slope == null) return null;
  // 9-hole course handicap uses half the course par as par-9 and half the
  // 18-hole index. We use full index * (slope/113) but compare against
  // par-9 directly — both adjustments keep strokes-given on the same scale.
  const par9 = course.par / 2;
  return Math.round(
    (handicapIndex / 2) * (slope / 113) + (rating - par9),
  );
}

/**
 * Net score = gross - course_handicap. Returns gross unchanged if the course
 * is missing the rating/slope needed to compute a course handicap.
 */
export function calculateNetScore(
  grossScore: number,
  handicapIndex: number,
  course: Parameters<typeof calculateCourseHandicap>[1],
  holeCount: 9 | 18,
  ninePlayed: "front" | "back" | null,
): number {
  const ch = calculateCourseHandicap(handicapIndex, course, holeCount, ninePlayed);
  if (ch == null) return grossScore;
  return grossScore - ch;
}
