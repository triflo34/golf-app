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

async function resolveName(key: string): Promise<string | null> {
  const ref = parseKey(key);
  if (!ref) return null;
  if (ref.kind === "user") {
    const row = await db
      .prepare("SELECT display_name FROM users WHERE id = ?")
      .get<{ display_name: string }>(ref.id);
    return row?.display_name ?? null;
  }
  const row = await db
    .prepare("SELECT guest_name FROM scores WHERE LOWER(guest_name) = ? LIMIT 1")
    .get<{ guest_name: string }>(ref.name);
  return row?.guest_name ?? null;
}

async function scoresForKey(
  roundIds: number[],
  key: string,
): Promise<Map<number, number>> {
  if (roundIds.length === 0) return new Map();
  const ref = parseKey(key);
  if (!ref) return new Map();
  const placeholders = roundIds.map(() => "?").join(",");
  const rows =
    ref.kind === "user"
      ? await db
          .prepare(
            `SELECT round_id, gross_score FROM scores
             WHERE round_id IN (${placeholders}) AND player_id = ?`,
          )
          .all<{ round_id: number; gross_score: number }>(...roundIds, ref.id)
      : await db
          .prepare(
            `SELECT round_id, gross_score FROM scores
             WHERE round_id IN (${placeholders}) AND LOWER(guest_name) = ?`,
          )
          .all<{ round_id: number; gross_score: number }>(...roundIds, ref.name);
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

  const aName = await resolveName(aKey);
  const bName = await resolveName(bKey);
  if (!aName || !bName) {
    return NextResponse.json({ error: "Unknown player" }, { status: 404 });
  }

  const aRef = parseKey(aKey)!;
  const bRef = parseKey(bKey)!;

  const aRoundRows =
    aRef.kind === "user"
      ? await db
          .prepare("SELECT round_id FROM scores WHERE player_id = ?")
          .all<{ round_id: number }>(aRef.id)
      : await db
          .prepare("SELECT round_id FROM scores WHERE LOWER(guest_name) = ?")
          .all<{ round_id: number }>(aRef.name);
  const bRoundRows =
    bRef.kind === "user"
      ? await db
          .prepare("SELECT round_id FROM scores WHERE player_id = ?")
          .all<{ round_id: number }>(bRef.id)
      : await db
          .prepare("SELECT round_id FROM scores WHERE LOWER(guest_name) = ?")
          .all<{ round_id: number }>(bRef.name);

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
    const roundRows = await db
      .prepare(
        `SELECT r.id, r.played_at, c.name as course_name
         FROM rounds r JOIN courses c ON c.id = r.course_id
         WHERE r.id IN (${placeholders})${seasonClause}
         ORDER BY r.played_at DESC`,
      )
      .all<{ id: number; played_at: string; course_name: string }>(
        ...sharedRoundIds,
        ...seasonArgs,
      );

    const aMap = await scoresForKey(sharedRoundIds, aKey);
    const bMap = await scoresForKey(sharedRoundIds, bKey);

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
