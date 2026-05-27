import {
  calculateFairnessDelta,
  calculateTeamHandicap,
  type MatchFormat,
} from "./handicap";

export type BuilderPlayer = {
  key: string;
  name: string;
  course_handicap: number;
};

export type TeamArrangement = {
  teams: BuilderPlayer[][];
  team_handicaps: number[];
  fairness_delta: number;
};

function* combinationIndices(n: number, k: number): Generator<number[]> {
  if (k < 0 || k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield [...idx];
    let i = k - 1;
    while (i >= 0 && idx[i] === i + n - k) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

/**
 * All unique partitions of `players` into two teams of sizes `aSize` and
 * `players.length - aSize`. For equal-size partitions, mirrors are deduped so
 * each pairing is emitted once.
 */
export function buildTwoTeamArrangements(
  players: BuilderPlayer[],
  format: MatchFormat,
  aSize: number,
  topN = 5,
): TeamArrangement[] {
  const n = players.length;
  if (n < 2 || aSize < 1 || aSize >= n) return [];

  const equalSplit = aSize * 2 === n;
  const out: TeamArrangement[] = [];
  const seen = new Set<string>();

  for (const idx of combinationIndices(n, aSize)) {
    if (equalSplit && !idx.includes(0)) continue;

    const inA = new Set(idx);
    const a: BuilderPlayer[] = [];
    const b: BuilderPlayer[] = [];
    for (let i = 0; i < n; i++) {
      if (inA.has(i)) a.push(players[i]);
      else b.push(players[i]);
    }

    const aKey = a.map((p) => p.key).sort().join(",");
    const bKey = b.map((p) => p.key).sort().join(",");
    const partKey = [aKey, bKey].sort().join("|");
    if (seen.has(partKey)) continue;
    seen.add(partKey);

    const aHc = calculateTeamHandicap(
      a.map((p) => p.course_handicap),
      format,
    );
    const bHc = calculateTeamHandicap(
      b.map((p) => p.course_handicap),
      format,
    );
    out.push({
      teams: [a, b],
      team_handicaps: [aHc, bHc],
      fairness_delta: calculateFairnessDelta([aHc, bHc]),
    });
  }

  out.sort((x, y) => x.fairness_delta - y.fairness_delta);
  return out.slice(0, topN);
}
