import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

type ScoreJoin = {
  round_id: number;
  player_id: string | null;
  guest_name: string | null;
  display_name: string | null;
  gross_score: number;
  played_at: string;
  hole_count: number;
  temp_high_f: number | null;
  temp_low_f: number | null;
  wind_max_mph: number | null;
  precip_in: number | null;
  weather_code: number | null;
};

export type SeriesPoint = {
  played_at: string;
  gross_score: number;
  points: number | null;
  rank: number | null;
  temp_high_f: number | null;
  temp_low_f: number | null;
  wind_max_mph: number | null;
  precip_in: number | null;
  weather_code: number | null;
};

export type LeaderboardRow = {
  key: string;
  name: string;
  is_guest: boolean;
  user_id: string | null;
  rounds_played: number;
  avg_score: number;
  best_score: number;
  wins: number;
  points: number;
  firsts: number;
  seconds: number;
  thirds: number;
  fourths: number;
  firsts_tied: number;
  seconds_tied: number;
  thirds_tied: number;
  fourths_tied: number;
  series: SeriesPoint[];
};

export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const seasonParam = url.searchParams.get("season");
  const season = seasonParam ? Number(seasonParam) : new Date().getFullYear();
  if (!Number.isInteger(season) || season < 2000 || season > 2100) {
    return NextResponse.json({ error: "Invalid season" }, { status: 400 });
  }
  const scope = url.searchParams.get("scope") === "all" ? "all" : "mine";
  const holesParam = url.searchParams.get("holes");
  const holes: "18" | "9" | "all" =
    holesParam === "9" ? "9" : holesParam === "all" ? "all" : "18";
  const start = `${season}-01-01`;
  const end = `${season}-12-31`;

  const holesFilter = holes === "all" ? "" : "AND r.hole_count = ?";
  const holesArg: number[] = holes === "all" ? [] : [Number(holes)];

  // For scope=mine, find every round id where the current user has a score,
  // then only keep score rows from those rounds. Guarantees the board only
  // includes people the user has actually played with.
  let allowedKeys: Set<string> | null = null;
  if (scope === "mine") {
    const myRoundRows = await db
      .prepare(
        `SELECT DISTINCT s.round_id
         FROM scores s
         JOIN rounds r ON r.id = s.round_id
         WHERE s.player_id = ? AND r.played_at >= ? AND r.played_at <= ? ${holesFilter}`,
      )
      .all<{ round_id: number }>(me.id, start, end, ...holesArg);
    if (myRoundRows.length === 0) {
      // No rounds for the current user in this season — return just them.
      return NextResponse.json({
        season,
        scope,
        holes,
        leaderboard: [
          {
            key: `u:${me.id}`,
            name: me.display_name,
            is_guest: false,
            user_id: me.id,
            rounds_played: 0,
            avg_score: 0,
            best_score: 0,
            wins: 0,
            points: 0,
            firsts: 0,
            seconds: 0,
            thirds: 0,
            fourths: 0,
            firsts_tied: 0,
            seconds_tied: 0,
            thirds_tied: 0,
            fourths_tied: 0,
            series: [],
          },
        ],
      });
    }
    const myRoundIds = myRoundRows.map((r) => r.round_id);
    const placeholders = myRoundIds.map(() => "?").join(",");
    const circleRows = await db
      .prepare(
        `SELECT DISTINCT player_id, guest_name
         FROM scores
         WHERE round_id IN (${placeholders})`,
      )
      .all<{ player_id: string | null; guest_name: string | null }>(...myRoundIds);
    allowedKeys = new Set(
      circleRows.map((r) =>
        r.player_id ? `u:${r.player_id}` : `g:${(r.guest_name ?? "").toLowerCase()}`,
      ),
    );
    // Make sure the current user always appears, even if their season just started.
    allowedKeys.add(`u:${me.id}`);
  }

  const rows = await db
    .prepare(
      `SELECT s.round_id, s.player_id, s.guest_name, u.display_name, s.gross_score,
              r.played_at, r.hole_count,
              r.temp_high_f, r.temp_low_f, r.wind_max_mph, r.precip_in, r.weather_code
       FROM scores s
       JOIN rounds r ON r.id = s.round_id
       LEFT JOIN users u ON u.id = s.player_id
       WHERE r.played_at >= ? AND r.played_at <= ?
         AND (s.player_id IS NULL OR u.hidden = 0)
         ${holesFilter}`,
    )
    .all<ScoreJoin>(start, end, ...holesArg);

  type Bucket = {
    key: string;
    name: string;
    is_guest: boolean;
    user_id: string | null;
    scores: number[];
    roundIds: Set<number>;
    wins: number;
    points: number;
    firsts: number;
    seconds: number;
    thirds: number;
    fourths: number;
    firsts_tied: number;
    seconds_tied: number;
    thirds_tied: number;
    fourths_tied: number;
    series: SeriesPoint[];
  };

  type RoundWeatherFields = {
    temp_high_f: number | null;
    temp_low_f: number | null;
    wind_max_mph: number | null;
    precip_in: number | null;
    weather_code: number | null;
  };
  const buckets = new Map<string, Bucket>();
  const roundScores = new Map<
    number,
    {
      played_at: string;
      weather: RoundWeatherFields;
      entries: Array<{ key: string; gross: number }>;
    }
  >();

  for (const row of rows) {
    const key = row.player_id ? `u:${row.player_id}` : `g:${(row.guest_name ?? "").toLowerCase()}`;
    if (allowedKeys && !allowedKeys.has(key)) continue;
    const name = row.player_id ? row.display_name ?? "?" : row.guest_name ?? "?";

    let b = buckets.get(key);
    if (!b) {
      b = {
        key,
        name,
        is_guest: !row.player_id,
        user_id: row.player_id,
        scores: [],
        roundIds: new Set(),
        wins: 0,
        points: 0,
        firsts: 0,
        seconds: 0,
        thirds: 0,
        fourths: 0,
        firsts_tied: 0,
        seconds_tied: 0,
        thirds_tied: 0,
        fourths_tied: 0,
        series: [],
      };
      buckets.set(key, b);
    }
    b.scores.push(row.gross_score);
    b.roundIds.add(row.round_id);

    let rs = roundScores.get(row.round_id);
    if (!rs) {
      rs = {
        played_at: row.played_at,
        weather: {
          temp_high_f: row.temp_high_f,
          temp_low_f: row.temp_low_f,
          wind_max_mph: row.wind_max_mph,
          precip_in: row.precip_in,
          weather_code: row.weather_code,
        },
        entries: [],
      };
      roundScores.set(row.round_id, rs);
    }
    rs.entries.push({ key, gross: row.gross_score });
  }

  // Placement: competition ranking (ties share lowest rank, next rank skipped).
  // Linear points: rank r in field of N → points = N - r + 1. Solo rounds (N<2) get series entries with null rank/points and are skipped for aggregation.
  for (const [, round] of roundScores) {
    if (round.entries.length < 2) {
      // Solo round — still attach a series entry so the chart can show the score.
      for (const e of round.entries) {
        const b = buckets.get(e.key);
        if (b) {
          b.series.push({
            played_at: round.played_at,
            gross_score: e.gross,
            points: null,
            rank: null,
            ...round.weather,
          });
        }
      }
      continue;
    }
    const sorted = [...round.entries].sort((a, c) => a.gross - c.gross);
    const N = sorted.length;
    // Assign ranks.
    const ranks: number[] = [];
    let rank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i].gross > sorted[i - 1].gross) rank = i + 1;
      ranks.push(rank);
    }
    // Count how many share each rank (for tie detection).
    const rankSize = new Map<number, number>();
    for (const r of ranks) rankSize.set(r, (rankSize.get(r) ?? 0) + 1);

    for (let i = 0; i < sorted.length; i++) {
      const r = ranks[i];
      const tied = (rankSize.get(r) ?? 1) > 1;
      const points = N - r + 1;
      const b = buckets.get(sorted[i].key);
      if (!b) continue;
      b.series.push({
        played_at: round.played_at,
        gross_score: sorted[i].gross,
        points,
        rank: r,
        ...round.weather,
      });
      b.points += points;
      if (r === 1) {
        b.firsts += 1;
        if (tied) b.firsts_tied += 1;
      } else if (r === 2) {
        b.seconds += 1;
        if (tied) b.seconds_tied += 1;
      } else if (r === 3) {
        b.thirds += 1;
        if (tied) b.thirds_tied += 1;
      } else if (r === 4) {
        b.fourths += 1;
        if (tied) b.fourths_tied += 1;
      }
    }
    // Wins = sole 1st place (preserve existing semantic).
    const min = sorted[0].gross;
    const winners = sorted.filter((p) => p.gross === min);
    if (winners.length === 1) {
      const b = buckets.get(winners[0].key);
      if (b) b.wins += 1;
    }
  }

  const result: LeaderboardRow[] = [];
  for (const b of buckets.values()) {
    if (b.scores.length === 0) continue;
    const sum = b.scores.reduce((a, c) => a + c, 0);
    result.push({
      key: b.key,
      name: b.name,
      is_guest: b.is_guest,
      user_id: b.user_id,
      rounds_played: b.roundIds.size,
      avg_score: Math.round((sum / b.scores.length) * 10) / 10,
      best_score: Math.min(...b.scores),
      wins: b.wins,
      points: b.points,
      firsts: b.firsts,
      seconds: b.seconds,
      thirds: b.thirds,
      fourths: b.fourths,
      firsts_tied: b.firsts_tied,
      seconds_tied: b.seconds_tied,
      thirds_tied: b.thirds_tied,
      fourths_tied: b.fourths_tied,
      series: [...b.series].sort((a, c) => a.played_at.localeCompare(c.played_at)),
    });
  }
  result.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (a.avg_score !== b.avg_score) return a.avg_score - b.avg_score;
    return a.best_score - b.best_score;
  });

  return NextResponse.json({ season, scope, holes, leaderboard: result });
}
