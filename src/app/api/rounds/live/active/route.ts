import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export type ActiveLiveRound = {
  id: number;
  course_name: string;
  played_at: string;
  hole_count: number;
  i_am_in: boolean;
  player_count: number;
};

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await db
    .prepare(
      `SELECT r.id,
              c.name AS course_name,
              r.played_at,
              r.hole_count,
              COALESCE(rp.cnt, 0)::int AS player_count,
              CASE WHEN EXISTS (
                SELECT 1 FROM round_players
                WHERE round_id = r.id AND player_id = ?
              ) OR r.created_by = ? THEN TRUE ELSE FALSE END AS i_am_in
       FROM rounds r
       JOIN courses c ON c.id = r.course_id
       LEFT JOIN (
         SELECT round_id, COUNT(*)::int AS cnt
         FROM round_players GROUP BY round_id
       ) rp ON rp.round_id = r.id
       WHERE r.status = 'live'
       ORDER BY r.played_at DESC, r.id DESC
       LIMIT 10`,
    )
    .all<ActiveLiveRound>(me.id, me.id);

  return NextResponse.json({ rounds: rows });
}
