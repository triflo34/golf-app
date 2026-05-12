import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export type AdminGuestSummary = {
  name: string;
  rounds_played: number;
  scores: number;
};

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!me.is_admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = await db
    .prepare(
      `SELECT MAX(s.guest_name) AS name,
              COUNT(DISTINCT s.round_id)::int AS rounds_played,
              COUNT(*)::int AS scores
       FROM scores s
       WHERE s.guest_name IS NOT NULL
       GROUP BY LOWER(s.guest_name)
       ORDER BY LOWER(s.guest_name) ASC`,
    )
    .all<{ name: string; rounds_played: number; scores: number }>();

  return NextResponse.json({ guests: rows });
}
