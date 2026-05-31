import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export type RoundListItem = {
  id: number;
  played_at: string;
  course_id: number;
  course_name: string;
  notes: string | null;
  excluded: boolean;
  scores: {
    player_id: string | null;
    guest_name: string | null;
    name: string;
    is_guest: boolean;
    gross_score: number;
  }[];
};

export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "5", 10) || 5, 1),
    50,
  );

  const rounds = await db
    .prepare(
      `SELECT r.id, r.played_at, r.course_id, c.name as course_name, r.notes, r.excluded
       FROM rounds r JOIN courses c ON c.id = r.course_id
       ORDER BY r.played_at DESC, r.id DESC
       LIMIT ?`,
    )
    .all<{
      id: number;
      played_at: string;
      course_id: number;
      course_name: string;
      notes: string | null;
      excluded: boolean;
    }>(limit);

  if (rounds.length === 0) return NextResponse.json({ rounds: [] });

  const ids = rounds.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const scoreRows = await db
    .prepare(
      `SELECT s.round_id, s.player_id, s.guest_name, s.gross_score,
              u.display_name
       FROM scores s
       LEFT JOIN users u ON u.id = s.player_id
       WHERE s.round_id IN (${placeholders})
       ORDER BY s.gross_score ASC`,
    )
    .all<{
      round_id: number;
      player_id: string | null;
      guest_name: string | null;
      gross_score: number;
      display_name: string | null;
    }>(...ids);

  const byRound = new Map<number, RoundListItem["scores"]>();
  for (const s of scoreRows) {
    if (!byRound.has(s.round_id)) byRound.set(s.round_id, []);
    byRound.get(s.round_id)!.push({
      player_id: s.player_id,
      guest_name: s.guest_name,
      name: s.player_id ? s.display_name ?? "?" : s.guest_name ?? "?",
      is_guest: !s.player_id,
      gross_score: s.gross_score,
    });
  }

  const result: RoundListItem[] = rounds.map((r) => ({
    ...r,
    scores: byRound.get(r.id) ?? [],
  }));

  return NextResponse.json({ rounds: result });
}
