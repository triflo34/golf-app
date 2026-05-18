import "server-only";
import { db } from "@/lib/db";
import { ensureCourseHoles } from "@/lib/events";

export type LeaderboardEntry = {
  player_id: string;
  display_name: string;
  strokes: number;
  through: number;
  vs_par: number;
  per_round: { round_id: number; round_number: number; strokes: number; through: number }[];
};

export type Best18Entry = {
  player_id: string;
  display_name: string;
  total: number; // sum of best 9 strokes from each round
  has_full_data: boolean; // both rounds at 18 holes scored
};

export type Worst18Entry = {
  player_id: string;
  display_name: string;
  total: number;
  has_full_data: boolean;
};

export type MostSameEntry = {
  player_id: string;
  display_name: string;
  number: number | null; // the repeated stroke count
  count: number;
};

export type ScrambleTeamStanding = {
  team_id: number;
  name: string;
  strokes: number;
  through: number;
  vs_par: number;
  members: { user_id: string; display_name: string }[];
};

export type ScrambleWinners = {
  team_standings: ScrambleTeamStanding[];
  winner_team_id: number | null;
  payout_per_member_cents: number | null;
};

export type SideGameSummary = {
  kind: "poker" | "best18" | "worst18" | "most_same" | "scramble_winners";
  pot_cents: number;
};

export type EventStandings = {
  leaderboard: LeaderboardEntry[];
  best18: Best18Entry[] | null;
  worst18: Worst18Entry[] | null;
  most_same: MostSameEntry[] | null;
  scramble_winners: ScrambleWinners | null;
  side_games: SideGameSummary[];
};

type PlayerRow = { user_id: string; display_name: string };
type RoundRow = {
  id: number;
  round_number: number;
  hole_count: number;
  course_id: number;
  round_format: "individual" | "scramble";
};
type HoleScoreRow = {
  round_id: number;
  player_id: string;
  hole_number: number;
  strokes: number;
  par: number | null;
};
type TeamScoreRow = {
  team_id: number;
  hole_number: number;
  strokes: number;
  round_id: number;
  par: number | null;
};
type TeamMemberRow = { team_id: number; user_id: string };
type SideGameRow = { kind: SideGameSummary["kind"]; pot_cents: number };

export async function loadEventStandings(eventId: number): Promise<EventStandings> {
  // Independent up-front queries: run in parallel.
  const [players, rounds, sideGameRows] = await Promise.all([
    db
      .prepare(
        `SELECT ep.user_id, u.display_name
         FROM event_participants ep JOIN users u ON u.id = ep.user_id
         WHERE ep.event_id = ? AND ep.role = 'player'
         ORDER BY u.display_name ASC`,
      )
      .all<PlayerRow>(eventId),
    db
      .prepare(
        `SELECT id, round_number, hole_count, course_id, round_format FROM rounds
         WHERE event_id = ? ORDER BY round_number ASC`,
      )
      .all<RoundRow>(eventId),
    db
      .prepare("SELECT kind, pot_cents FROM side_games WHERE event_id = ?")
      .all<SideGameRow>(eventId),
  ]);

  if (rounds.length === 0 || players.length === 0) {
    return {
      leaderboard: [],
      best18: null,
      worst18: null,
      most_same: null,
      scramble_winners: null,
      side_games: sideGameRows,
    };
  }

  const courseId = rounds[0].course_id;
  const roundIds = rounds.map((r) => r.id);
  const placeholders = roundIds.map(() => "?").join(",");

  // ensureCourseHoles + hole_scores fetch are independent — parallel.
  const [holes, scoreRows] = await Promise.all([
    ensureCourseHoles(courseId),
    db
      .prepare(
        `SELECT round_id, player_id, hole_number, strokes, par
         FROM hole_scores WHERE round_id IN (${placeholders})`,
      )
      .all<HoleScoreRow>(...roundIds),
  ]);
  // Live course pars as a fallback for any rows that pre-date snapshotting.
  const parByHole = new Map(holes.map((h) => [h.hole_number, h.par]));

  // Fan out team_hole_scores onto each team member for scramble rounds, so the
  // leaderboard math (and best/worst-18) doesn't have to special-case them.
  const scrambleRoundIds = rounds.filter((r) => r.round_format === "scramble").map((r) => r.id);
  if (scrambleRoundIds.length > 0) {
    const sPlaceholders = scrambleRoundIds.map(() => "?").join(",");
    const teamScores = await db
      .prepare(
        `SELECT ths.team_id, ths.hole_number, ths.strokes, ths.par, st.round_id
         FROM team_hole_scores ths
         JOIN scramble_teams st ON st.id = ths.team_id
         WHERE st.round_id IN (${sPlaceholders})`,
      )
      .all<TeamScoreRow>(...scrambleRoundIds);
    if (teamScores.length > 0) {
      const teamIds = Array.from(new Set(teamScores.map((s) => s.team_id)));
      const tPlaceholders = teamIds.map(() => "?").join(",");
      const memberRows = await db
        .prepare(
          `SELECT team_id, user_id FROM scramble_team_members
           WHERE team_id IN (${tPlaceholders})`,
        )
        .all<TeamMemberRow>(...teamIds);
      const membersByTeam = new Map<number, string[]>();
      for (const m of memberRows) {
        if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, []);
        membersByTeam.get(m.team_id)!.push(m.user_id);
      }
      for (const ts of teamScores) {
        for (const uid of membersByTeam.get(ts.team_id) ?? []) {
          scoreRows.push({
            round_id: ts.round_id,
            player_id: uid,
            hole_number: ts.hole_number,
            strokes: ts.strokes,
            par: ts.par,
          });
        }
      }
    }
  }

  // Index: scoresByPlayer[playerId][roundId] = array of {hole, strokes}
  const scoresByPlayerRound = new Map<string, Map<number, HoleScoreRow[]>>();
  for (const s of scoreRows) {
    let perPlayer = scoresByPlayerRound.get(s.player_id);
    if (!perPlayer) {
      perPlayer = new Map();
      scoresByPlayerRound.set(s.player_id, perPlayer);
    }
    let arr = perPlayer.get(s.round_id);
    if (!arr) {
      arr = [];
      perPlayer.set(s.round_id, arr);
    }
    arr.push(s);
  }

  // ---- Leaderboard ----
  const leaderboard: LeaderboardEntry[] = players.map((p) => {
    let strokes = 0;
    let through = 0;
    let vsPar = 0;
    const perRound: LeaderboardEntry["per_round"] = [];
    for (const r of rounds) {
      const rs = scoresByPlayerRound.get(p.user_id)?.get(r.id) ?? [];
      let rStrokes = 0;
      for (const s of rs) {
        rStrokes += s.strokes;
        // Prefer snapshotted par on the row; fall back to current course_holes
        // for rows that were written before snapshotting existed.
        const parForHole = s.par ?? parByHole.get(s.hole_number) ?? 4;
        vsPar += s.strokes - parForHole;
      }
      strokes += rStrokes;
      through += rs.length;
      perRound.push({
        round_id: r.id,
        round_number: r.round_number,
        strokes: rStrokes,
        through: rs.length,
      });
    }
    return {
      player_id: p.user_id,
      display_name: p.display_name,
      strokes,
      through,
      vs_par: vsPar,
      per_round: perRound,
    };
  });
  // Sort: through DESC first (more holes = more authoritative), then strokes ASC
  leaderboard.sort((a, b) => {
    if (b.through !== a.through) return b.through - a.through;
    return a.strokes - b.strokes;
  });

  const enabledSet = new Set(sideGameRows.map((e) => e.kind));

  // ---- Best 18 / Worst 18 ----
  function best9PerRound(playerId: string, roundId: number, holeCount: number, mode: "best" | "worst"): { total: number; full: boolean } {
    const rs = scoresByPlayerRound.get(playerId)?.get(roundId) ?? [];
    if (rs.length < Math.min(9, holeCount)) {
      // not enough holes yet — sum whatever we have but flag incomplete
      const strokes = rs.map((r) => r.strokes).sort((a, b) => (mode === "best" ? a - b : b - a));
      return { total: strokes.reduce((a, b) => a + b, 0), full: false };
    }
    const sorted = rs.map((r) => r.strokes).sort((a, b) => (mode === "best" ? a - b : b - a));
    const pick = sorted.slice(0, 9);
    return { total: pick.reduce((a, b) => a + b, 0), full: rs.length === holeCount };
  }

  let best18: Best18Entry[] | null = null;
  if (enabledSet.has("best18")) {
    best18 = players.map((p) => {
      let total = 0;
      let full = true;
      for (const r of rounds) {
        const { total: t, full: f } = best9PerRound(p.user_id, r.id, r.hole_count, "best");
        total += t;
        if (!f) full = false;
      }
      return {
        player_id: p.user_id,
        display_name: p.display_name,
        total,
        has_full_data: full,
      };
    });
    best18.sort((a, b) => a.total - b.total);
  }

  let worst18: Worst18Entry[] | null = null;
  if (enabledSet.has("worst18")) {
    worst18 = players.map((p) => {
      let total = 0;
      let full = true;
      for (const r of rounds) {
        const { total: t, full: f } = best9PerRound(p.user_id, r.id, r.hole_count, "worst");
        total += t;
        if (!f) full = false;
      }
      return {
        player_id: p.user_id,
        display_name: p.display_name,
        total,
        has_full_data: full,
      };
    });
    worst18.sort((a, b) => b.total - a.total);
  }

  // ---- Most Same Number (round 1 only) ----
  let mostSame: MostSameEntry[] | null = null;
  if (enabledSet.has("most_same")) {
    const round1 = rounds.find((r) => r.round_number === 1);
    mostSame = players.map((p) => {
      const rs = round1 ? scoresByPlayerRound.get(p.user_id)?.get(round1.id) ?? [] : [];
      const counts = new Map<number, number>();
      for (const s of rs) {
        counts.set(s.strokes, (counts.get(s.strokes) ?? 0) + 1);
      }
      let bestNum: number | null = null;
      let bestCount = 0;
      for (const [num, cnt] of counts) {
        if (cnt > bestCount || (cnt === bestCount && bestNum != null && num < bestNum)) {
          bestNum = num;
          bestCount = cnt;
        }
      }
      return {
        player_id: p.user_id,
        display_name: p.display_name,
        number: bestNum,
        count: bestCount,
      };
    });
    mostSame.sort((a, b) => b.count - a.count);
  }

  // ---- Scramble Winners ----
  let scrambleWinners: ScrambleWinners | null = null;
  if (enabledSet.has("scramble_winners")) {
    const scrambleRound = rounds.find((r) => r.round_format === "scramble");
    if (scrambleRound) {
      const teamRows = await db
        .prepare(
          `SELECT id, name FROM scramble_teams WHERE round_id = ? ORDER BY id ASC`,
        )
        .all<{ id: number; name: string }>(scrambleRound.id);
      let teamStandings: ScrambleTeamStanding[] = [];
      if (teamRows.length > 0) {
        const teamIds = teamRows.map((t) => t.id);
        const tPlaceholders = teamIds.map(() => "?").join(",");
        const teamScores = await db
          .prepare(
            `SELECT team_id, hole_number, strokes, par FROM team_hole_scores
             WHERE team_id IN (${tPlaceholders})`,
          )
          .all<{
            team_id: number;
            hole_number: number;
            strokes: number;
            par: number | null;
          }>(...teamIds);
        const memberRows = await db
          .prepare(
            `SELECT m.team_id, m.user_id, u.display_name
             FROM scramble_team_members m JOIN users u ON u.id = m.user_id
             WHERE m.team_id IN (${tPlaceholders})
             ORDER BY u.display_name ASC`,
          )
          .all<{ team_id: number; user_id: string; display_name: string }>(...teamIds);
        const scoresByTeam = new Map<
          number,
          { hole_number: number; strokes: number; par: number | null }[]
        >();
        for (const s of teamScores) {
          if (!scoresByTeam.has(s.team_id)) scoresByTeam.set(s.team_id, []);
          scoresByTeam.get(s.team_id)!.push(s);
        }
        const membersByTeam = new Map<number, { user_id: string; display_name: string }[]>();
        for (const m of memberRows) {
          if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, []);
          membersByTeam.get(m.team_id)!.push({
            user_id: m.user_id,
            display_name: m.display_name,
          });
        }
        teamStandings = teamRows.map((t) => {
          const ss = scoresByTeam.get(t.id) ?? [];
          let strokes = 0;
          let vsPar = 0;
          for (const s of ss) {
            strokes += s.strokes;
            const parForHole = s.par ?? parByHole.get(s.hole_number) ?? 4;
            vsPar += s.strokes - parForHole;
          }
          return {
            team_id: t.id,
            name: t.name,
            strokes,
            through: ss.length,
            vs_par: vsPar,
            members: membersByTeam.get(t.id) ?? [],
          };
        });
        teamStandings.sort((a, b) => {
          if (b.through !== a.through) return b.through - a.through;
          return a.strokes - b.strokes;
        });
      }

      // Winner = first side_game_results row tagged to a team for this side game.
      const sgRow = await db
        .prepare(
          `SELECT id, pot_cents FROM side_games
           WHERE event_id = ? AND kind = 'scramble_winners'`,
        )
        .get<{ id: number; pot_cents: number }>(eventId);
      let winnerTeamId: number | null = null;
      let payoutPerMember: number | null = null;
      if (sgRow) {
        const winRow = await db
          .prepare(
            `SELECT team_id FROM side_game_results
             WHERE side_game_id = ? AND team_id IS NOT NULL
             ORDER BY rank ASC NULLS LAST LIMIT 1`,
          )
          .get<{ team_id: number }>(sgRow.id);
        if (winRow) {
          winnerTeamId = winRow.team_id;
          const winningTeam = teamStandings.find((t) => t.team_id === winnerTeamId);
          const memberCount = winningTeam?.members.length ?? 0;
          if (memberCount > 0) {
            payoutPerMember = Math.floor(sgRow.pot_cents / memberCount);
          }
        }
      }
      scrambleWinners = {
        team_standings: teamStandings,
        winner_team_id: winnerTeamId,
        payout_per_member_cents: payoutPerMember,
      };
    }
  }

  return {
    leaderboard,
    best18,
    worst18,
    most_same: mostSame,
    scramble_winners: scrambleWinners,
    side_games: sideGameRows,
  };
}
