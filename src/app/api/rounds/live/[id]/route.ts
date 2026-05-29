import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureCourseHoles, type CourseHoleMeta } from "@/lib/events";

type RoundRow = {
  id: number;
  course_id: number;
  course_name: string;
  played_at: string;
  notes: string | null;
  hole_count: number;
  nine_played: "front" | "back" | null;
  status: "live" | "final";
  scoring_mode: "total" | "hole_by_hole";
  created_by: string;
  created_by_name: string;
};

type RosterRow = {
  player_id: string | null;
  guest_name: string | null;
  seq: number;
  display_name: string | null;
};

type HoleScoreRow = {
  id: number;
  player_id: string | null;
  guest_name: string | null;
  hole_number: number;
  strokes: number;
  updated_by: string | null;
  updated_by_name: string | null;
  updated_at: string;
};

export type LivePlayer = {
  key: string;
  name: string;
  is_guest: boolean;
  player_id: string | null;
  guest_name: string | null;
  seq: number;
};

export type LiveLeaderRow = {
  key: string;
  name: string;
  is_guest: boolean;
  player_id: string | null;
  guest_name: string | null;
  through: number;
  strokes: number;
  vs_par: number;
  rank: number;
  is_leader: boolean;
};

export type LiveRoundLoad = {
  round: RoundRow;
  holes: CourseHoleMeta[];
  players: LivePlayer[];
  scores: HoleScoreRow[];
  leaderboard: LiveLeaderRow[];
};

function keyFor(playerId: string | null, guestName: string | null): string {
  return playerId ? `u:${playerId}` : `g:${(guestName ?? "").toLowerCase()}`;
}

export async function GET(
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
      `SELECT r.id, r.course_id, c.name AS course_name, r.played_at, r.notes,
              r.hole_count, r.nine_played, r.status, r.scoring_mode,
              r.created_by, u.display_name AS created_by_name
         FROM rounds r
         JOIN courses c ON c.id = r.course_id
         JOIN users   u ON u.id = r.created_by
        WHERE r.id = ?`,
    )
    .get<RoundRow>(rid);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  if (round.scoring_mode !== "hole_by_hole") {
    return NextResponse.json(
      { error: "Round is not a hole-by-hole round" },
      { status: 400 },
    );
  }

  const allHoles = await ensureCourseHoles(round.course_id);
  // For 9-hole rounds played on the back, the live scorer still numbers the
  // holes 10..18 so the existing hole_scores rows line up with par/yardage.
  const holes =
    round.hole_count === 9 && round.nine_played === "back"
      ? allHoles.filter((h) => h.hole_number >= 10 && h.hole_number <= 18)
      : round.hole_count === 9
        ? allHoles.filter((h) => h.hole_number >= 1 && h.hole_number <= 9)
        : allHoles;

  const roster = await db
    .prepare(
      `SELECT rp.player_id, rp.guest_name, rp.seq,
              u.display_name
         FROM round_players rp
         LEFT JOIN users u ON u.id = rp.player_id
        WHERE rp.round_id = ?
        ORDER BY rp.seq ASC`,
    )
    .all<RosterRow>(rid);

  const players: LivePlayer[] = roster.map((r) => ({
    key: keyFor(r.player_id, r.guest_name),
    name: r.player_id ? (r.display_name ?? "Player") : (r.guest_name ?? "Guest"),
    is_guest: r.player_id == null,
    player_id: r.player_id,
    guest_name: r.guest_name,
    seq: r.seq,
  }));

  const scores = await db
    .prepare(
      `SELECT hs.id, hs.player_id, hs.guest_name, hs.hole_number, hs.strokes,
              hs.updated_by, u.display_name AS updated_by_name, hs.updated_at
         FROM hole_scores hs
         LEFT JOIN users u ON u.id = hs.updated_by
        WHERE hs.round_id = ?
        ORDER BY hs.hole_number ASC`,
    )
    .all<HoleScoreRow>(rid);

  const parByHole = new Map(holes.map((h) => [h.hole_number, h.par]));
  type Agg = {
    through: number;
    strokes: number;
    vsPar: number;
  };
  const aggByKey = new Map<string, Agg>();
  for (const p of players) {
    aggByKey.set(p.key, { through: 0, strokes: 0, vsPar: 0 });
  }
  for (const s of scores) {
    const k = keyFor(s.player_id, s.guest_name);
    const a = aggByKey.get(k);
    if (!a) continue;
    a.through += 1;
    a.strokes += s.strokes;
    a.vsPar += s.strokes - (parByHole.get(s.hole_number) ?? 4);
  }

  // Competition ranking by vsPar ascending. Players with 0 holes played are
  // sorted last but still tied at the bottom rank slot. Ties share rank.
  const rows: Omit<LiveLeaderRow, "rank" | "is_leader">[] = players.map(
    (p) => {
      const a = aggByKey.get(p.key)!;
      return {
        key: p.key,
        name: p.name,
        is_guest: p.is_guest,
        player_id: p.player_id,
        guest_name: p.guest_name,
        through: a.through,
        strokes: a.strokes,
        vs_par: a.vsPar,
      };
    },
  );
  const seqByKey = new Map(players.map((p) => [p.key, p.seq]));
  rows.sort((a, b) => {
    // Played players first (anyone with a hole entered sits above untouched
    // entries). After that, vsPar is the canonical metric.
    if (a.through === 0 && b.through > 0) return 1;
    if (b.through === 0 && a.through > 0) return -1;
    if (a.vs_par !== b.vs_par) return a.vs_par - b.vs_par;
    if (a.strokes !== b.strokes) return a.strokes - b.strokes;
    return (seqByKey.get(a.key) ?? 0) - (seqByKey.get(b.key) ?? 0);
  });

  const leaderboard: LiveLeaderRow[] = [];
  let lastVsPar: number | null = null;
  let lastThroughBucket: number | null = null; // 0 vs >0
  let currentRank = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const through0 = r.through === 0 ? 0 : 1;
    const tied =
      lastVsPar !== null &&
      r.vs_par === lastVsPar &&
      through0 === lastThroughBucket;
    if (!tied) currentRank = i + 1;
    lastVsPar = r.vs_par;
    lastThroughBucket = through0;
    leaderboard.push({
      ...r,
      rank: currentRank,
      is_leader: currentRank === 1 && r.through > 0,
    });
  }

  return NextResponse.json({
    round,
    holes,
    players,
    scores,
    leaderboard,
  });
}
