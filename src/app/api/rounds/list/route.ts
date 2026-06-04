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

export type RoundListCursor = { before_at: string; before_id: number };

export type RoundListResponse = {
  rounds: RoundListItem[];
  next_cursor: RoundListCursor | null;
};

export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1),
    100,
  );
  // Keyset pagination cursor: the (played_at, id) of the last row the client
  // already has. Ordering is played_at DESC, id DESC, so "older" = strictly
  // less than the cursor. Lets the All Rounds page page through everything.
  const beforeAt = url.searchParams.get("before_at");
  const beforeId = url.searchParams.get("before_id");
  const hasCursor = Boolean(beforeAt && beforeId);

  type Row = {
    id: number;
    played_at: string;
    course_id: number;
    course_name: string;
    notes: string | null;
    excluded: boolean;
  };

  const rounds = hasCursor
    ? await db
        .prepare(
          `SELECT r.id, r.played_at, r.course_id, c.name as course_name, r.notes, r.excluded
           FROM rounds r JOIN courses c ON c.id = r.course_id
           WHERE r.played_at < ? OR (r.played_at = ? AND r.id < ?)
           ORDER BY r.played_at DESC, r.id DESC
           LIMIT ?`,
        )
        .all<Row>(beforeAt, beforeAt, Number(beforeId), limit)
    : await db
        .prepare(
          `SELECT r.id, r.played_at, r.course_id, c.name as course_name, r.notes, r.excluded
           FROM rounds r JOIN courses c ON c.id = r.course_id
           ORDER BY r.played_at DESC, r.id DESC
           LIMIT ?`,
        )
        .all<Row>(limit);

  if (rounds.length === 0) {
    return NextResponse.json({ rounds: [], next_cursor: null });
  }

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

  // If we filled the page there may be more — hand back a cursor to continue.
  const last = rounds[rounds.length - 1];
  const next_cursor =
    rounds.length === limit
      ? { before_at: last.played_at, before_id: last.id }
      : null;

  return NextResponse.json({ rounds: result, next_cursor });
}
