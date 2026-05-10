import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseKey } from "@/lib/players";

type RoundScore = {
  round_id: number;
  played_at: string;
  course_name: string;
  a_score: number | null;
  b_score: number | null;
};

export type H2HResult = {
  a: { key: string; name: string };
  b: { key: string; name: string };
  rounds_played: number;
  a_wins: number;
  b_wins: number;
  ties: number;
  history: {
    round_id: number;
    played_at: string;
    course_name: string;
    a_score: number;
    b_score: number;
  }[];
};

function resolveName(key: string): string | null {
  const ref = parseKey(key);
  if (!ref) return null;
  if (ref.kind === "user") {
    const row = db
      .prepare("SELECT display_name FROM users WHERE id = ?")
      .get(ref.id) as { display_name: string } | undefined;
    return row?.display_name ?? null;
  }
  // For guests, find canonical-case name from any score row.
  const row = db
    .prepare(
      "SELECT guest_name FROM scores WHERE LOWER(guest_name) = ? LIMIT 1",
    )
    .get(ref.name) as { guest_name: string } | undefined;
  return row?.guest_name ?? null;
}

function scoresForKey(roundIds: number[], key: string): Map<number, number> {
  if (roundIds.length === 0) return new Map();
  const ref = parseKey(key);
  if (!ref) return new Map();
  const placeholders = roundIds.map(() => "?").join(",");
  const rows =
    ref.kind === "user"
      ? (db
          .prepare(
            `SELECT round_id, gross_score FROM scores
             WHERE round_id IN (${placeholders}) AND player_id = ?`,
          )
          .all(...roundIds, ref.id) as { round_id: number; gross_score: number }[])
      : (db
          .prepare(
            `SELECT round_id, gross_score FROM scores
             WHERE round_id IN (${placeholders}) AND LOWER(guest_name) = ?`,
          )
          .all(...roundIds, ref.name) as { round_id: number; gross_score: number }[]);
  return new Map(rows.map((r) => [r.round_id, r.gross_score]));
}

export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const aKey = url.searchParams.get("a") ?? "";
  const bKey = url.searchParams.get("b") ?? "";
  const seasonParam = url.searchParams.get("season");
  const season = seasonParam ? Number(seasonParam) : null;
  if (!aKey || !bKey || aKey === bKey) {
    return NextResponse.json(
      { error: "Pick two different players" },
      { status: 400 },
    );
  }
  if (season != null && (!Number.isInteger(season) || season < 2000 || season > 2100)) {
    return NextResponse.json({ error: "Invalid season" }, { status: 400 });
  }

  const aName = resolveName(aKey);
  const bName = resolveName(bKey);
  if (!aName || !bName) {
    return NextResponse.json({ error: "Unknown player" }, { status: 404 });
  }

  // Find all rounds where both A and B have a score.
  const aRef = parseKey(aKey)!;
  const bRef = parseKey(bKey)!;

  const aRoundRows = (aRef.kind === "user"
    ? db
        .prepare("SELECT round_id FROM scores WHERE player_id = ?")
        .all(aRef.id)
    : db
        .prepare(
          "SELECT round_id FROM scores WHERE LOWER(guest_name) = ?",
        )
        .all(aRef.name)) as { round_id: number }[];
  const bRoundRows = (bRef.kind === "user"
    ? db
        .prepare("SELECT round_id FROM scores WHERE player_id = ?")
        .all(bRef.id)
    : db
        .prepare(
          "SELECT round_id FROM scores WHERE LOWER(guest_name) = ?",
        )
        .all(bRef.name)) as { round_id: number }[];

  const aSet = new Set(aRoundRows.map((r) => r.round_id));
  const sharedRoundIds = bRoundRows
    .map((r) => r.round_id)
    .filter((id) => aSet.has(id));

  let a_wins = 0;
  let b_wins = 0;
  let ties = 0;
  const history: H2HResult["history"] = [];

  if (sharedRoundIds.length > 0) {
    const placeholders = sharedRoundIds.map(() => "?").join(",");
    const seasonClause =
      season != null ? " AND r.played_at >= ? AND r.played_at <= ?" : "";
    const seasonArgs =
      season != null ? [`${season}-01-01`, `${season}-12-31`] : [];
    const roundRows = db
      .prepare(
        `SELECT r.id, r.played_at, c.name as course_name
         FROM rounds r JOIN courses c ON c.id = r.course_id
         WHERE r.id IN (${placeholders})${seasonClause}
         ORDER BY r.played_at DESC`,
      )
      .all(...sharedRoundIds, ...seasonArgs) as {
      id: number;
      played_at: string;
      course_name: string;
    }[];

    const aMap = scoresForKey(sharedRoundIds, aKey);
    const bMap = scoresForKey(sharedRoundIds, bKey);

    for (const r of roundRows) {
      const aS = aMap.get(r.id);
      const bS = bMap.get(r.id);
      if (aS == null || bS == null) continue;
      if (aS < bS) a_wins += 1;
      else if (bS < aS) b_wins += 1;
      else ties += 1;
      history.push({
        round_id: r.id,
        played_at: r.played_at,
        course_name: r.course_name,
        a_score: aS,
        b_score: bS,
      });
    }
  }

  const result: H2HResult = {
    a: { key: aKey, name: aName },
    b: { key: bKey, name: bName },
    rounds_played: history.length,
    a_wins,
    b_wins,
    ties,
    history,
  };

  return NextResponse.json(result);
}

export type { RoundScore };
