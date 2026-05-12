import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export type FunStats = {
  season: number | null;
  lowest_round: {
    name: string;
    is_guest: boolean;
    gross_score: number;
    course_name: string;
    played_at: string;
    round_id: number;
  } | null;
  biggest_blowout: {
    winner_name: string;
    runner_up_name: string;
    margin: number;
    winner_score: number;
    runner_up_score: number;
    course_name: string;
    played_at: string;
    round_id: number;
  } | null;
  most_played_pair: {
    a_name: string;
    b_name: string;
    rounds_together: number;
  } | null;
};

type ScoreRow = {
  round_id: number;
  played_at: string;
  course_name: string;
  player_id: string | null;
  guest_name: string | null;
  display_name: string | null;
  gross_score: number;
};

function nameOf(row: ScoreRow): string {
  return row.player_id ? row.display_name ?? "?" : row.guest_name ?? "?";
}
function keyOf(row: ScoreRow): string {
  return row.player_id
    ? `u:${row.player_id}`
    : `g:${(row.guest_name ?? "").toLowerCase()}`;
}

export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const seasonParam = url.searchParams.get("season");
  const season = seasonParam ? Number(seasonParam) : null;
  if (season != null && (!Number.isInteger(season) || season < 2000 || season > 2100)) {
    return NextResponse.json({ error: "Invalid season" }, { status: 400 });
  }

  const seasonClause =
    season != null ? " WHERE r.played_at >= ? AND r.played_at <= ?" : "";
  const seasonArgs =
    season != null ? [`${season}-01-01`, `${season}-12-31`] : [];

  const rows = await db
    .prepare(
      `SELECT s.round_id, r.played_at, c.name AS course_name,
              s.player_id, s.guest_name, u.display_name, s.gross_score
       FROM scores s
       JOIN rounds r ON r.id = s.round_id
       JOIN courses c ON c.id = r.course_id
       LEFT JOIN users u ON u.id = s.player_id
       ${seasonClause}
       ORDER BY s.gross_score ASC`,
    )
    .all<ScoreRow>(...seasonArgs);

  if (rows.length === 0) {
    return NextResponse.json({
      season,
      lowest_round: null,
      biggest_blowout: null,
      most_played_pair: null,
    } satisfies FunStats);
  }

  // Lowest round: the first row (sorted asc).
  const low = rows[0];
  const lowest_round: FunStats["lowest_round"] = {
    name: nameOf(low),
    is_guest: !low.player_id,
    gross_score: low.gross_score,
    course_name: low.course_name,
    played_at: low.played_at,
    round_id: low.round_id,
  };

  // Group by round for blowout and pair calcs.
  const byRound = new Map<number, ScoreRow[]>();
  for (const r of rows) {
    if (!byRound.has(r.round_id)) byRound.set(r.round_id, []);
    byRound.get(r.round_id)!.push(r);
  }

  // Biggest blowout: among rounds with ≥2 players, max gap between best and second-best.
  let biggest_blowout: FunStats["biggest_blowout"] = null;
  for (const [, field] of byRound) {
    if (field.length < 2) continue;
    const sorted = [...field].sort((a, b) => a.gross_score - b.gross_score);
    const margin = sorted[1].gross_score - sorted[0].gross_score;
    if (margin <= 0) continue;
    if (!biggest_blowout || margin > biggest_blowout.margin) {
      biggest_blowout = {
        winner_name: nameOf(sorted[0]),
        runner_up_name: nameOf(sorted[1]),
        margin,
        winner_score: sorted[0].gross_score,
        runner_up_score: sorted[1].gross_score,
        course_name: sorted[0].course_name,
        played_at: sorted[0].played_at,
        round_id: sorted[0].round_id,
      };
    }
  }

  // Most-played pair: count distinct rounds each pair shares.
  const pairCounts = new Map<
    string,
    { a_key: string; b_key: string; a_name: string; b_name: string; count: number }
  >();
  for (const [, field] of byRound) {
    if (field.length < 2) continue;
    for (let i = 0; i < field.length; i++) {
      for (let j = i + 1; j < field.length; j++) {
        const ki = keyOf(field[i]);
        const kj = keyOf(field[j]);
        const [a, b, an, bn] =
          ki < kj
            ? [ki, kj, nameOf(field[i]), nameOf(field[j])]
            : [kj, ki, nameOf(field[j]), nameOf(field[i])];
        const pk = `${a}|${b}`;
        const existing = pairCounts.get(pk);
        if (existing) existing.count += 1;
        else pairCounts.set(pk, { a_key: a, b_key: b, a_name: an, b_name: bn, count: 1 });
      }
    }
  }
  let most_played_pair: FunStats["most_played_pair"] = null;
  for (const v of pairCounts.values()) {
    if (!most_played_pair || v.count > most_played_pair.rounds_together) {
      most_played_pair = {
        a_name: v.a_name,
        b_name: v.b_name,
        rounds_together: v.count,
      };
    }
  }

  return NextResponse.json({
    season,
    lowest_round,
    biggest_blowout,
    most_played_pair,
  } satisfies FunStats);
}
