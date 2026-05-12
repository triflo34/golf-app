import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseKey } from "@/lib/players";

export type CourseAgg = {
  course_id: number;
  course_name: string;
  rounds_played: number;
  avg_score: number;
  best_score: number;
};

export type PlayerStats = {
  key: string;
  name: string;
  is_guest: boolean;
  rounds_played: number;
  total_wins: number;
  avg_score: number | null;
  best_score: number | null;
  worst_score: number | null;
  by_course: CourseAgg[];
  recent: {
    round_id: number;
    played_at: string;
    course_name: string;
    gross_score: number;
    placement: number | null;
    field_size: number;
  }[];
};

export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  const seasonParam = url.searchParams.get("season");
  const season = seasonParam ? Number(seasonParam) : null;
  const ref = parseKey(key);
  if (!ref) return NextResponse.json({ error: "Bad key" }, { status: 400 });
  if (season != null && (!Number.isInteger(season) || season < 2000 || season > 2100)) {
    return NextResponse.json({ error: "Invalid season" }, { status: 400 });
  }

  const seasonClause =
    season != null ? " AND r.played_at >= ? AND r.played_at <= ?" : "";
  const seasonArgs =
    season != null ? [`${season}-01-01`, `${season}-12-31`] : [];

  type ScoreRow = {
    round_id: number;
    gross_score: number;
    played_at: string;
    course_id: number;
    course_name: string;
  };

  const scoreRows =
    ref.kind === "user"
      ? await db
          .prepare(
            `SELECT s.round_id, s.gross_score, r.played_at, r.course_id, c.name as course_name
             FROM scores s
             JOIN rounds r ON r.id = s.round_id
             JOIN courses c ON c.id = r.course_id
             WHERE s.player_id = ?${seasonClause}
             ORDER BY r.played_at DESC`,
          )
          .all<ScoreRow>(ref.id, ...seasonArgs)
      : await db
          .prepare(
            `SELECT s.round_id, s.gross_score, r.played_at, r.course_id, c.name as course_name
             FROM scores s
             JOIN rounds r ON r.id = s.round_id
             JOIN courses c ON c.id = r.course_id
             WHERE LOWER(s.guest_name) = ?${seasonClause}
             ORDER BY r.played_at DESC`,
          )
          .all<ScoreRow>(ref.name, ...seasonArgs);

  let name = "?";
  if (ref.kind === "user") {
    const u = await db
      .prepare("SELECT display_name FROM users WHERE id = ?")
      .get<{ display_name: string }>(ref.id);
    name = u?.display_name ?? "?";
  } else {
    const g = await db
      .prepare("SELECT guest_name FROM scores WHERE LOWER(guest_name) = ? LIMIT 1")
      .get<{ guest_name: string }>(ref.name);
    name = g?.guest_name ?? ref.name;
  }

  if (scoreRows.length === 0) {
    const empty: PlayerStats = {
      key,
      name,
      is_guest: ref.kind === "guest",
      rounds_played: 0,
      total_wins: 0,
      avg_score: null,
      best_score: null,
      worst_score: null,
      by_course: [],
      recent: [],
    };
    return NextResponse.json(empty);
  }

  const scores = scoreRows.map((r) => r.gross_score);
  const total = scores.reduce((a, c) => a + c, 0);

  const roundIds = scoreRows.map((r) => r.round_id);
  const placeholders = roundIds.map(() => "?").join(",");
  const fieldRows = await db
    .prepare(
      `SELECT round_id, player_id, guest_name, gross_score
       FROM scores WHERE round_id IN (${placeholders})`,
    )
    .all<{
      round_id: number;
      player_id: string | null;
      guest_name: string | null;
      gross_score: number;
    }>(...roundIds);

  const byRound = new Map<number, typeof fieldRows>();
  for (const r of fieldRows) {
    if (!byRound.has(r.round_id)) byRound.set(r.round_id, []);
    byRound.get(r.round_id)!.push(r);
  }

  const myKey = ref.kind === "user" ? `u:${ref.id}` : `g:${ref.name}`;
  const matchesMe = (r: (typeof fieldRows)[number]) =>
    ref.kind === "user"
      ? r.player_id === ref.id
      : (r.guest_name ?? "").toLowerCase() === ref.name;

  const recent: PlayerStats["recent"] = [];
  for (const sr of scoreRows.slice(0, 10)) {
    const field = byRound.get(sr.round_id) ?? [];
    const sortedAsc = [...field].sort((a, b) => a.gross_score - b.gross_score);
    const placement = sortedAsc.findIndex(matchesMe) + 1;
    recent.push({
      round_id: sr.round_id,
      played_at: sr.played_at,
      course_name: sr.course_name,
      gross_score: sr.gross_score,
      placement: placement > 0 ? placement : null,
      field_size: field.length,
    });
  }

  let totalWins = 0;
  for (const [, field] of byRound) {
    if (field.length < 2) continue;
    const min = Math.min(...field.map((f) => f.gross_score));
    const winners = field.filter((f) => f.gross_score === min);
    if (winners.length === 1 && matchesMe(winners[0])) totalWins += 1;
  }

  const byCourseMap = new Map<
    number,
    { course_id: number; course_name: string; scores: number[] }
  >();
  for (const r of scoreRows) {
    let entry = byCourseMap.get(r.course_id);
    if (!entry) {
      entry = { course_id: r.course_id, course_name: r.course_name, scores: [] };
      byCourseMap.set(r.course_id, entry);
    }
    entry.scores.push(r.gross_score);
  }
  const by_course: CourseAgg[] = [];
  for (const c of byCourseMap.values()) {
    const sum = c.scores.reduce((a, x) => a + x, 0);
    by_course.push({
      course_id: c.course_id,
      course_name: c.course_name,
      rounds_played: c.scores.length,
      avg_score: Math.round((sum / c.scores.length) * 10) / 10,
      best_score: Math.min(...c.scores),
    });
  }
  by_course.sort((a, b) => a.avg_score - b.avg_score);

  const result: PlayerStats = {
    key: myKey,
    name,
    is_guest: ref.kind === "guest",
    rounds_played: new Set(roundIds).size,
    total_wins: totalWins,
    avg_score: Math.round((total / scores.length) * 10) / 10,
    best_score: Math.min(...scores),
    worst_score: Math.max(...scores),
    by_course,
    recent,
  };
  return NextResponse.json(result);
}
