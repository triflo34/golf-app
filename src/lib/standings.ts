import "server-only";
import { db } from "@/lib/db";
import { ensureCourseHoles } from "@/lib/events";

export type LeaderboardEntry = {
  player_id: string;
  display_name: string;
  strokes: number;
  through: number;
  vs_par: number;
  per_round: {
    round_id: number;
    round_number: number;
    strokes: number;
    through: number;
    vs_par: number;
  }[];
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

export type PokerStandings = {
  players: { player_id: string; display_name: string; card_count: number }[];
  winner_player_id: string | null;
  payout_cents: number | null;
};

/** One line of what a player won, e.g. {label: "Best 18", amount_cents: 2000}. */
export type SettlementShare = { label: string; amount_cents: number };

export type SettlementPlayer = {
  player_id: string;
  display_name: string;
  paid_cents: number; // total bought in across entry + side games
  won_cents: number; // total winnings
  net_cents: number; // won - paid
  won_breakdown: SettlementShare[];
};

/** A single "A pays B $X" suggestion from the minimal settle-up matching. */
export type SettlementTransfer = {
  from_id: string;
  from_name: string;
  to_id: string;
  to_name: string;
  amount_cents: number;
};

export type Settlement = {
  players: SettlementPlayer[];
  transfers: SettlementTransfer[];
  total_pot_cents: number; // sum of every settled pool (entry + side games with a winner)
};

export type EventStandings = {
  leaderboard: LeaderboardEntry[];
  best18: Best18Entry[] | null;
  worst18: Worst18Entry[] | null;
  most_same: MostSameEntry[] | null;
  scramble_winners: ScrambleWinners | null;
  poker: PokerStandings | null;
  settlement: Settlement | null;
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
  const [players, rounds, sideGameRows, eventRow] = await Promise.all([
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
    db
      .prepare("SELECT entry_fee_cents FROM events WHERE id = ?")
      .get<{ entry_fee_cents: number }>(eventId),
  ]);
  const entryFeeCents = eventRow?.entry_fee_cents ?? 0;

  if (rounds.length === 0 || players.length === 0) {
    return {
      leaderboard: [],
      best18: null,
      worst18: null,
      most_same: null,
      scramble_winners: null,
      poker: null,
      settlement: null,
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
      let rVsPar = 0;
      for (const s of rs) {
        rStrokes += s.strokes;
        // Prefer snapshotted par on the row; fall back to current course_holes
        // for rows that were written before snapshotting existed.
        const parForHole = s.par ?? parByHole.get(s.hole_number) ?? 4;
        const delta = s.strokes - parForHole;
        vsPar += delta;
        rVsPar += delta;
      }
      strokes += rStrokes;
      through += rs.length;
      perRound.push({
        round_id: r.id,
        round_number: r.round_number,
        strokes: rStrokes,
        through: rs.length,
        vs_par: rVsPar,
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

  // ---- Poker (winner is organizer-picked, stored in side_game_results) ----
  let poker: PokerStandings | null = null;
  if (enabledSet.has("poker")) {
    const handRows = await db
      .prepare(
        `SELECT ph.player_id, u.display_name,
                COALESCE(jsonb_array_length(ph.cards), 0) AS card_count
         FROM poker_hands ph JOIN users u ON u.id = ph.player_id
         WHERE ph.event_id = ?
         ORDER BY u.display_name ASC`,
      )
      .all<{ player_id: string; display_name: string; card_count: number }>(
        eventId,
      );
    const sgRow = await db
      .prepare(
        `SELECT id, pot_cents FROM side_games WHERE event_id = ? AND kind = 'poker'`,
      )
      .get<{ id: number; pot_cents: number }>(eventId);
    let winnerPlayerId: string | null = null;
    let payoutCents: number | null = null;
    if (sgRow) {
      const winRow = await db
        .prepare(
          `SELECT player_id, payout_cents FROM side_game_results
           WHERE side_game_id = ? AND player_id IS NOT NULL
           ORDER BY rank ASC NULLS LAST LIMIT 1`,
        )
        .get<{ player_id: string; payout_cents: number }>(sgRow.id);
      if (winRow) {
        winnerPlayerId = winRow.player_id;
        payoutCents = winRow.payout_cents;
      }
    }
    poker = {
      players: handRows.map((h) => ({
        player_id: h.player_id,
        display_name: h.display_name,
        card_count: h.card_count,
      })),
      winner_player_id: winnerPlayerId,
      payout_cents: payoutCents,
    };
  }

  const settlement = computeSettlement({
    players,
    entryFeeCents,
    leaderboard,
    sideGameRows,
    best18,
    worst18,
    mostSame,
    scrambleWinners,
    poker,
  });

  return {
    leaderboard,
    best18,
    worst18,
    most_same: mostSame,
    scramble_winners: scrambleWinners,
    poker,
    settlement,
    side_games: sideGameRows,
  };
}

/**
 * Splits `total` cents evenly across `ids`, handing the integer remainder out
 * one cent at a time to the first recipients so the parts always sum to `total`.
 */
function distribute(total: number, ids: string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (ids.length === 0 || total <= 0) return out;
  const base = Math.floor(total / ids.length);
  let rem = total - base * ids.length;
  for (const id of ids) {
    out.set(id, base + (rem > 0 ? 1 : 0));
    if (rem > 0) rem -= 1;
  }
  return out;
}

/** Winners of a ranked side game: every row tied at the best value. */
function tiedWinners<T>(
  rows: T[] | null,
  getValue: (t: T) => number,
  mode: "min" | "max",
  getId: (t: T) => string,
): string[] {
  if (!rows || rows.length === 0) return [];
  const values = rows.map(getValue);
  const target = mode === "min" ? Math.min(...values) : Math.max(...values);
  if (target <= 0) return []; // no real scores yet
  return rows.filter((r) => getValue(r) === target).map(getId);
}

/**
 * Money settlement for a completed (or in-progress) event. Each "pool" — the
 * entry pot plus every side game that has a winner — is funded by an equal
 * buy-in from all players and paid out to its winner(s). Pools without a winner
 * are skipped entirely (no buy-in charged) so the books always balance, which
 * lets the greedy who-pays-whom matching settle to exactly zero.
 *
 * Assumptions surfaced in the UI: every player bought into every side game
 * equally, and the overall low score takes the entry pot.
 */
function computeSettlement(args: {
  players: PlayerRow[];
  entryFeeCents: number;
  leaderboard: LeaderboardEntry[];
  sideGameRows: SideGameRow[];
  best18: Best18Entry[] | null;
  worst18: Worst18Entry[] | null;
  mostSame: MostSameEntry[] | null;
  scrambleWinners: ScrambleWinners | null;
  poker: PokerStandings | null;
}): Settlement {
  const {
    players,
    entryFeeCents,
    leaderboard,
    sideGameRows,
    best18,
    worst18,
    mostSame,
    scrambleWinners,
    poker,
  } = args;

  const allIds = players.map((p) => p.user_id);
  const nameById = new Map(players.map((p) => [p.user_id, p.display_name]));
  const paid = new Map<string, number>(allIds.map((id) => [id, 0]));
  const won = new Map<string, number>(allIds.map((id) => [id, 0]));
  const breakdown = new Map<string, SettlementShare[]>(
    allIds.map((id) => [id, []]),
  );
  let totalPot = 0;

  function settlePool(
    potCents: number,
    winnerIds: string[],
    label: string,
  ): void {
    if (potCents <= 0 || winnerIds.length === 0) return;
    for (const [id, amt] of distribute(potCents, allIds)) {
      paid.set(id, (paid.get(id) ?? 0) + amt);
    }
    for (const [id, amt] of distribute(potCents, winnerIds)) {
      won.set(id, (won.get(id) ?? 0) + amt);
      breakdown.get(id)?.push({ label, amount_cents: amt });
    }
    totalPot += potCents;
  }

  // Entry pot → overall low score (ties split).
  const scored = leaderboard.filter((e) => e.through > 0);
  if (scored.length > 0) {
    const minStrokes = Math.min(...scored.map((e) => e.strokes));
    const entryWinners = scored
      .filter((e) => e.strokes === minStrokes)
      .map((e) => e.player_id);
    settlePool(entryFeeCents * allIds.length, entryWinners, "Overall (entry pot)");
  }

  const potByKind = new Map(sideGameRows.map((g) => [g.kind, g.pot_cents]));
  settlePool(
    potByKind.get("best18") ?? 0,
    tiedWinners(best18, (r) => r.total, "min", (r) => r.player_id),
    "Best 18",
  );
  settlePool(
    potByKind.get("worst18") ?? 0,
    tiedWinners(worst18, (r) => r.total, "max", (r) => r.player_id),
    "Worst 18",
  );
  settlePool(
    potByKind.get("most_same") ?? 0,
    tiedWinners(mostSame, (r) => r.count, "max", (r) => r.player_id),
    "Most Same Number",
  );
  if (scrambleWinners?.winner_team_id != null) {
    const team = scrambleWinners.team_standings.find(
      (t) => t.team_id === scrambleWinners.winner_team_id,
    );
    settlePool(
      potByKind.get("scramble_winners") ?? 0,
      team?.members.map((m) => m.user_id) ?? [],
      "3-Man Scramble",
    );
  }
  if (poker?.winner_player_id) {
    settlePool(
      potByKind.get("poker") ?? 0,
      [poker.winner_player_id],
      "Poker",
    );
  }

  const settlementPlayers: SettlementPlayer[] = allIds.map((id) => {
    const paidCents = paid.get(id) ?? 0;
    const wonCents = won.get(id) ?? 0;
    return {
      player_id: id,
      display_name: nameById.get(id) ?? "Player",
      paid_cents: paidCents,
      won_cents: wonCents,
      net_cents: wonCents - paidCents,
      won_breakdown: breakdown.get(id) ?? [],
    };
  });
  settlementPlayers.sort((a, b) => b.net_cents - a.net_cents);

  return {
    players: settlementPlayers,
    transfers: minimalTransfers(settlementPlayers, nameById),
    total_pot_cents: totalPot,
  };
}

/**
 * Greedy settle-up: repeatedly match the biggest debtor against the biggest
 * creditor. Because every pool balances, net sums to zero and this clears in at
 * most (players - 1) transfers.
 */
function minimalTransfers(
  players: SettlementPlayer[],
  nameById: Map<string, string>,
): SettlementTransfer[] {
  const creditors = players
    .filter((p) => p.net_cents > 0)
    .map((p) => ({ id: p.player_id, amt: p.net_cents }))
    .sort((a, b) => b.amt - a.amt);
  const debtors = players
    .filter((p) => p.net_cents < 0)
    .map((p) => ({ id: p.player_id, amt: -p.net_cents }))
    .sort((a, b) => b.amt - a.amt);

  const transfers: SettlementTransfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    if (pay > 0) {
      transfers.push({
        from_id: debtors[i].id,
        from_name: nameById.get(debtors[i].id) ?? "Player",
        to_id: creditors[j].id,
        to_name: nameById.get(creditors[j].id) ?? "Player",
        amount_cents: pay,
      });
    }
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt === 0) i += 1;
    if (creditors[j].amt === 0) j += 1;
  }
  return transfers;
}
