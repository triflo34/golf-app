/**
 * USGA Handicap Index calculation
 *
 * handicap_differential = (gross_score - course_rating) * 113 / slope_rating
 * handicap_index = average of best N differentials (see table below)
 *
 * Rounds | Use best
 * 3      | 1
 * 4      | 1
 * 5      | 1
 * 6      | 2
 * 7-8    | 2
 * 9-10   | 3
 * 11-12  | 4
 * 13-14  | 5
 * 15-16  | 6
 * 17     | 7
 * 18     | 8
 * 19     | 8
 * 20     | 8
 */

type RoundForHandicap = {
  gross_score: number;
  course_rating: number;
  slope_rating: number;
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

export function calculateDifferential(round: RoundForHandicap): number {
  return ((round.gross_score - round.course_rating) * 113) / round.slope_rating;
}

export function calculateHandicapIndex(
  rounds: RoundForHandicap[]
): number | null {
  // Need at least 3 rounds
  if (rounds.length < 3) return null;

  // Use only last 20 rounds
  const recent = rounds.slice(-20);

  const differentials = recent
    .map(calculateDifferential)
    .sort((a, b) => a - b);

  const bestN = bestNCount(recent.length);
  const bestDiffs = differentials.slice(0, bestN);

  const avg = bestDiffs.reduce((sum, d) => sum + d, 0) / bestDiffs.length;

  // Round to 1 decimal
  return Math.round(avg * 10) / 10;
}

export function calculateNetScore(
  grossScore: number,
  handicapIndex: number,
  slopeRating: number,
  courseRating: number,
  par: number
): number {
  // Course handicap = handicap_index * (slope_rating / 113) + (course_rating - par)
  const courseHandicap = Math.round(
    handicapIndex * (slopeRating / 113) + (courseRating - par)
  );
  return grossScore - courseHandicap;
}
