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
};

export type SeriesPoint = { played_at: string; gross_score: number };

export type LeaderboardRow = {
  key: string;
  name: string;
  is_guest: boolean;
  user_id: string | null;
  rounds_played: number;
  avg_score: number;
  best_score: number;
  wins: number;
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
  const start = `${season}-01-01`;
  const end = `${season}-12-31`;

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
         WHERE s.player_id = ? AND r.played_at >= ? AND r.played_at <= ?`,
      )
      .all<{ round_id: number }>(me.id, start, end);
    if (myRoundRows.length === 0) {
      // No rounds for the current user in this season — return just them.
      return NextResponse.json({
        season,
        scope,
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
      `SELECT s.round_id, s.player_id, s.guest_name, u.display_name, s.gross_score, r.played_at
       FROM scores s
       JOIN rounds r ON r.id = s.round_id
       LEFT JOIN users u ON u.id = s.player_id
       WHERE r.played_at >= ? AND r.played_at <= ?
         AND (s.player_id IS NULL OR u.hidden = 0)`,
    )
    .all<ScoreJoin>(start, end);

  type Bucket = {
    key: string;
    name: string;
    is_guest: boolean;
    user_id: string | null;
    scores: number[];
    roundIds: Set<number>;
    wins: number;
    series: SeriesPoint[];
  };

  const buckets = new Map<string, Bucket>();
  const roundScores = new Map<number, Array<{ key: string; gross: number }>>();

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
        series: [],
      };
      buckets.set(key, b);
    }
    b.scores.push(row.gross_score);
    b.roundIds.add(row.round_id);
    b.series.push({ played_at: row.played_at, gross_score: row.gross_score });

    if (!roundScores.has(row.round_id)) roundScores.set(row.round_id, []);
    roundScores.get(row.round_id)!.push({ key, gross: row.gross_score });
  }

  for (const [, players] of roundScores) {
    if (players.length < 2) continue;
    const min = Math.min(...players.map((p) => p.gross));
    const winners = players.filter((p) => p.gross === min);
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
      series: [...b.series].sort((a, c) => a.played_at.localeCompare(c.played_at)),
    });
  }
  result.sort((a, b) => a.avg_score - b.avg_score);

  return NextResponse.json({ season, scope, leaderboard: result });
}
