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

/**
 * USGA WHS table for selecting the lowest N differentials AND the adjustment
 * (in strokes) applied after averaging. The adjustment compensates for the
 * statistical noise of a small dataset — a single low diff at 3 rounds gets
 * -2.0, etc. Without these, a player with 5 valid rounds and one outlier good
 * round gets a much lower index than a player with 6 rounds and similar play.
 */
function bestNAndAdjustment(totalRounds: number): {
  bestN: number;
  adjustment: number;
} {
  if (totalRounds === 3) return { bestN: 1, adjustment: -2.0 };
  if (totalRounds === 4) return { bestN: 1, adjustment: -1.0 };
  if (totalRounds === 5) return { bestN: 1, adjustment: 0 };
  if (totalRounds === 6) return { bestN: 2, adjustment: -1.0 };
  if (totalRounds <= 8) return { bestN: 2, adjustment: 0 };
  if (totalRounds <= 11) return { bestN: 3, adjustment: 0 };
  if (totalRounds <= 14) return { bestN: 4, adjustment: 0 };
  if (totalRounds <= 16) return { bestN: 5, adjustment: 0 };
  if (totalRounds === 17) return { bestN: 6, adjustment: 0 };
  if (totalRounds === 18) return { bestN: 7, adjustment: 0 };
  return { bestN: 8, adjustment: 0 }; // 19-20
}

/**
 * Returns the 18-hole-equivalent differential for a round, or null if the
 * round is missing the rating/slope it needs.
 *
 * 9-hole fallback: when a course has no front-/back-9 rating but does have
 * an 18-hole rating, we approximate the 9-hole rating as `course_rating / 2`
 * and reuse the 18-hole slope. Slope is roughly constant across nines on
 * most courses, and the rating is by definition cumulative, so half the
 * 18-hole rating is a reasonable proxy. The round still gets a `*2`
 * 18-hole-equivalent differential. Callers can detect a fallback was used
 * via `calculateDifferentialWithMeta`.
 */
export function calculateDifferential(round: RoundForHandicap): number | null {
  return calculateDifferentialWithMeta(round).differential;
}

export type DifferentialMeta = {
  differential: number | null;
  /** True when a 9-hole rating was missing and we derived it from the 18-hole. */
  estimated: boolean;
};

export function calculateDifferentialWithMeta(
  round: RoundForHandicap,
): DifferentialMeta {
  if (round.hole_count === 18) {
    if (round.course_rating == null || round.slope_rating == null) {
      return { differential: null, estimated: false };
    }
    return {
      differential:
        ((round.gross_score - round.course_rating) * 113) / round.slope_rating,
      estimated: false,
    };
  }
  // 9-hole
  const nine = round.nine_played ?? "front";
  let rating = nine === "front" ? round.front_9_rating : round.back_9_rating;
  let slope = nine === "front" ? round.front_9_slope : round.back_9_slope;
  let estimated = false;
  if (rating == null && round.course_rating != null) {
    rating = round.course_rating / 2;
    estimated = true;
  }
  if (slope == null && round.slope_rating != null) {
    slope = round.slope_rating;
    estimated = true;
  }
  if (rating == null || slope == null) {
    return { differential: null, estimated: false };
  }
  const half = ((round.gross_score - rating) * 113) / slope;
  return { differential: half * 2, estimated };
}

export type HandicapIndexResult = {
  index: number | null;
  rounds_used: number;
  rounds_skipped: number;
  /** Number of lowest diffs averaged. 0 when index is null. */
  best_n: number;
  /** WHS stroke adjustment applied to the average (negative or zero). */
  adjustment: number;
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
    return {
      index: null,
      rounds_used: diffs.length,
      rounds_skipped: skipped,
      best_n: 0,
      adjustment: 0,
    };
  }

  diffs.sort((a, b) => a - b);
  const { bestN, adjustment } = bestNAndAdjustment(diffs.length);
  const bestDiffs = diffs.slice(0, bestN);
  const avg = bestDiffs.reduce((sum, d) => sum + d, 0) / bestDiffs.length;
  const index = Math.round((avg + adjustment) * 10) / 10;

  return {
    index,
    rounds_used: diffs.length,
    rounds_skipped: skipped,
    best_n: bestN,
    adjustment,
  };
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

/**
 * Scramble team handicap (USGA-recommended weighting). Each player's course
 * handicap is weighted by their position when the team is sorted from low to
 * high index; the weighted sum is rounded to the nearest integer.
 *
 *   2 players: 35% low + 15% high
 *   3 players: 30% low + 20% middle + 10% high
 *   4 players: 25% / 20% / 15% / 10%
 *
 * For 1 player, the team handicap is just that player's course handicap.
 * Anything beyond 4 falls back to the simple average — we don't expect teams
 * larger than 4 in this app's match builder.
 */
const SCRAMBLE_WEIGHTS: Record<number, number[]> = {
  1: [1.0],
  2: [0.35, 0.15],
  3: [0.3, 0.2, 0.1],
  4: [0.25, 0.2, 0.15, 0.1],
};

export function calculateScrambleHandicap(courseHandicaps: number[]): number {
  if (courseHandicaps.length === 0) return 0;
  const sorted = [...courseHandicaps].sort((a, b) => a - b);
  const weights = SCRAMBLE_WEIGHTS[sorted.length];
  if (weights) {
    const weighted = sorted.reduce((sum, h, i) => sum + h * weights[i], 0);
    return Math.round(weighted);
  }
  const avg = sorted.reduce((s, h) => s + h, 0) / sorted.length;
  return Math.round(avg);
}

/**
 * Match-format-aware team handicap. For non-scramble formats, the team is just
 * a roster of individual players — we report the simple average so the builder
 * can rank fairness consistently across formats. For best-ball and individual
 * formats, the player handicaps still drive per-hole strokes; the team-level
 * number is only used to compare teams against each other.
 */
export type MatchFormat = "scramble" | "best_ball" | "individual";

export function calculateTeamHandicap(
  courseHandicaps: number[],
  format: MatchFormat,
): number {
  if (courseHandicaps.length === 0) return 0;
  if (format === "scramble") return calculateScrambleHandicap(courseHandicaps);
  const avg =
    courseHandicaps.reduce((s, h) => s + h, 0) / courseHandicaps.length;
  return Math.round(avg * 10) / 10;
}

/**
 * Fairness delta = max team handicap - min team handicap. Lower is fairer.
 * Returns 0 for a single team (degenerate case).
 */
export function calculateFairnessDelta(teamHandicaps: number[]): number {
  if (teamHandicaps.length < 2) return 0;
  return Math.max(...teamHandicaps) - Math.min(...teamHandicaps);
}
