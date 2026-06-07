import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureCourseHoles } from "@/lib/events";

type RoundRow = {
  id: number;
  course_id: number;
  event_id: number;
  round_number: number;
  round_format: "individual" | "scramble";
  hole_count: number;
  played_at: string;
};

type HoleScoreRow = {
  id: number;
  player_id: string;
  hole_number: number;
  strokes: number;
  updated_by: string | null;
  updated_by_name: string | null;
  updated_at: string;
};

type PlayerRow = {
  user_id: string;
  display_name: string;
  group_num: number | null;
};

type TeamRow = {
  id: number;
  name: string;
};

type TeamMemberRow = {
  team_id: number;
  user_id: string;
  display_name: string;
};

type TeamScoreRow = {
  id: number;
  team_id: number;
  hole_number: number;
  strokes: number;
  updated_by: string | null;
  updated_by_name: string | null;
  updated_at: string;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; roundId: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, roundId } = await params;
  const eventId = Number(id);
  const rid = Number(roundId);
  if (!Number.isInteger(eventId) || !Number.isInteger(rid)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const round = await db
    .prepare(
      `SELECT id, course_id, event_id, round_number, round_format, hole_count, played_at
       FROM rounds WHERE id = ? AND event_id = ?`,
    )
    .get<RoundRow>(rid, eventId);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  // Is the viewer an organizer? Drives who can edit which rows in the scorer.
  const myParticipant = await db
    .prepare(
      `SELECT is_organizer FROM event_participants
       WHERE event_id = ? AND user_id = ?`,
    )
    .get<{ is_organizer: boolean }>(eventId, me.id);
  const viewerIsOrganizer = myParticipant?.is_organizer === true;

  // Event status + whether poker is on — the scorer uses these to offer the
  // "round complete → finish event & review poker" flow.
  const [eventRow, pokerRow, stablefordRow] = await Promise.all([
    db.prepare("SELECT status FROM events WHERE id = ?").get<{ status: string }>(eventId),
    db
      .prepare("SELECT 1 AS ok FROM side_games WHERE event_id = ? AND kind = 'poker'")
      .get<{ ok: number }>(eventId),
    db
      .prepare("SELECT 1 AS ok FROM side_games WHERE event_id = ? AND kind = 'stableford'")
      .get<{ ok: number }>(eventId),
  ]);

  const holes = await ensureCourseHoles(round.course_id);

  const players = await db
    .prepare(
      `SELECT ep.user_id, u.display_name, ep.group_num
       FROM event_participants ep
       JOIN users u ON u.id = ep.user_id
       WHERE ep.event_id = ? AND ep.role = 'player'
       ORDER BY ep.seq ASC, u.display_name ASC`,
    )
    .all<PlayerRow>(eventId);

  const scores = await db
    .prepare(
      `SELECT hs.id, hs.player_id, hs.hole_number, hs.strokes,
              hs.updated_by, u.display_name AS updated_by_name, hs.updated_at
       FROM hole_scores hs
       LEFT JOIN users u ON u.id = hs.updated_by
       WHERE hs.round_id = ?
       ORDER BY hs.hole_number ASC`,
    )
    .all<HoleScoreRow>(rid);

  let teams: (TeamRow & { members: TeamMemberRow[] })[] = [];
  let teamScores: TeamScoreRow[] = [];
  if (round.round_format === "scramble") {
    const tRows = await db
      .prepare(
        `SELECT id, name FROM scramble_teams
         WHERE round_id = ? ORDER BY id ASC`,
      )
      .all<TeamRow>(round.id);
    if (tRows.length > 0) {
      const teamIds = tRows.map((t) => t.id);
      const placeholders = teamIds.map(() => "?").join(",");
      const mRows = await db
        .prepare(
          `SELECT m.team_id, m.user_id, u.display_name
           FROM scramble_team_members m JOIN users u ON u.id = m.user_id
           WHERE m.team_id IN (${placeholders})
           ORDER BY u.display_name ASC`,
        )
        .all<TeamMemberRow>(...teamIds);
      const membersByTeam = new Map<number, TeamMemberRow[]>();
      for (const m of mRows) {
        if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, []);
        membersByTeam.get(m.team_id)!.push(m);
      }
      teams = tRows.map((t) => ({ ...t, members: membersByTeam.get(t.id) ?? [] }));

      teamScores = await db
        .prepare(
          `SELECT ths.id, ths.team_id, ths.hole_number, ths.strokes,
                  ths.updated_by, u.display_name AS updated_by_name, ths.updated_at
           FROM team_hole_scores ths
           LEFT JOIN users u ON u.id = ths.updated_by
           WHERE ths.team_id IN (${placeholders})
           ORDER BY ths.hole_number ASC`,
        )
        .all<TeamScoreRow>(...teamIds);
    }
  }

  return NextResponse.json({
    round,
    holes,
    players,
    scores,
    teams,
    team_scores: teamScores,
    viewer_id: me.id,
    viewer_is_organizer: viewerIsOrganizer,
    event_status: eventRow?.status ?? null,
    poker_enabled: Boolean(pokerRow),
    stableford_enabled: Boolean(stablefordRow),
  });
}
