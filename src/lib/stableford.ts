// Stableford points by score-to-par. Double bogey or worse = 0, bogey 1,
// par 2, birdie 4, eagle 8, albatross 16 — bad holes cap at zero. Client-safe
// (no server-only deps) so the scorer/scorecard can compute points live.
export function stablefordPoints(strokes: number, par: number): number {
  const diff = strokes - par;
  if (diff >= 2) return 0;
  return 2 ** (1 - diff);
}
