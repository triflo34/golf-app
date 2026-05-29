import { NextResponse, after } from "next/server";
import { db, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { populateRoundWeather } from "@/lib/weather";

type RoundRow = {
  id: number;
  status: "live" | "final";
  hole_count: number;
  nine_played: "front" | "back" | null;
};

type RosterRow = {
  player_id: string | null;
  guest_name: string | null;
};

type HoleAgg = {
  player_id: string | null;
  guest_name: string | null;
  total: number;
  count: number;
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const rid = Number(id);
  if (!Number.isInteger(rid)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const round = await db
    .prepare(
      "SELECT id, status, hole_count, nine_played FROM rounds WHERE id = ?",
    )
    .get<RoundRow>(rid);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  if (round.status !== "live") {
    return NextResponse.json(
      { error: "Round already finished" },
      { status: 400 },
    );
  }

  const roster = await db
    .prepare(
      "SELECT player_id, guest_name FROM round_players WHERE round_id = ?",
    )
    .all<RosterRow>(rid);
  if (roster.length === 0) {
    return NextResponse.json(
      { error: "Round has no players" },
      { status: 400 },
    );
  }

  const totals = await db
    .prepare(
      `SELECT player_id, guest_name,
              SUM(strokes)::int AS total,
              COUNT(*)::int     AS count
         FROM hole_scores
        WHERE round_id = ?
        GROUP BY player_id, guest_name`,
    )
    .all<HoleAgg>(rid);

  const keyOf = (p: string | null, g: string | null) =>
    p ? `u:${p}` : `g:${(g ?? "").toLowerCase()}`;
  const totalsByKey = new Map(totals.map((t) => [keyOf(t.player_id, t.guest_name), t]));

  // Every roster entry must have at least one hole; otherwise reject with a
  // helpful list so the UI can show which players still need scores.
  const missing = roster
    .filter((r) => !totalsByKey.has(keyOf(r.player_id, r.guest_name)))
    .map((r) => (r.player_id ? `player:${r.player_id}` : `guest:${r.guest_name}`));
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Some players have no scores yet`,
        missing,
      },
      { status: 400 },
    );
  }

  await withTransaction(async (tx) => {
    for (const r of roster) {
      const agg = totalsByKey.get(keyOf(r.player_id, r.guest_name))!;
      await tx
        .prepare(
          `INSERT INTO scores (round_id, player_id, guest_name, gross_score)
           VALUES (?, ?, ?, ?)
           ON CONFLICT DO NOTHING`,
        )
        .run(rid, r.player_id, r.guest_name, agg.total);
    }
    await tx
      .prepare(`UPDATE rounds SET status = 'final' WHERE id = ?`)
      .run(rid);
  });

  after(() => populateRoundWeather(rid));

  return NextResponse.json({ round_id: rid });
}
