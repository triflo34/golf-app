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

/**
 * Most-balanced split of `n` players into `k` teams. Larger teams come first
 * when n doesn't divide evenly (e.g. 7 into 3 → [3, 2, 2]).
 */
export function balancedTeamSizes(n: number, k: number): number[] {
  if (k <= 0 || k > n) return [];
  const base = Math.floor(n / k);
  const extra = n - base * k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * All unique partitions of `players` into teams of the requested `teamSizes`.
 * `teamSizes` must sum to `players.length`; team count can be any K ≥ 2.
 *
 * Dedup strategy: after building each candidate partition we canonicalize by
 * sorting each team's player keys and then sorting the teams. The resulting
 * partition key is hashed in a Set so we only emit each unordered partition
 * once. For 8 players in 4×2 teams this enumerates 2520 paths but emits 105
 * uniques — fast enough that we don't need clever symmetry pruning.
 *
 * `fairness_delta` = max team HC − min team HC, same as the 2-team case.
 */
export function buildMultiTeamArrangements(
  players: BuilderPlayer[],
  format: MatchFormat,
  teamSizes: number[],
  topN = 5,
): TeamArrangement[] {
  const n = players.length;
  const totalSize = teamSizes.reduce((s, x) => s + x, 0);
  if (totalSize !== n || teamSizes.length < 2 || teamSizes.some((s) => s < 1)) {
    return [];
  }

  const out: TeamArrangement[] = [];
  const seen = new Set<string>();

  function recurse(
    remaining: BuilderPlayer[],
    remainingSizes: number[],
    teamsSoFar: BuilderPlayer[][],
  ) {
    if (remainingSizes.length === 0) {
      const teamKeys = teamsSoFar
        .map((t) => t.map((p) => p.key).sort().join(","))
        .sort();
      const partKey = teamKeys.join("|");
      if (seen.has(partKey)) return;
      seen.add(partKey);

      const hcs = teamsSoFar.map((t) =>
        calculateTeamHandicap(
          t.map((p) => p.course_handicap),
          format,
        ),
      );
      out.push({
        teams: teamsSoFar,
        team_handicaps: hcs,
        fairness_delta: calculateFairnessDelta(hcs),
      });
      return;
    }

    const size = remainingSizes[0];
    const rest = remainingSizes.slice(1);
    for (const idx of combinationIndices(remaining.length, size)) {
      const inTeam = new Set(idx);
      const team: BuilderPlayer[] = [];
      const others: BuilderPlayer[] = [];
      for (let i = 0; i < remaining.length; i++) {
        if (inTeam.has(i)) team.push(remaining[i]);
        else others.push(remaining[i]);
      }
      recurse(others, rest, [...teamsSoFar, team]);
    }
  }

  recurse(players, teamSizes, []);
  out.sort((x, y) => x.fairness_delta - y.fairness_delta);
  return out.slice(0, topN);
}
