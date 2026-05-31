import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export type ScoreEditEntry = {
  id: number;
  hole_number: number;
  old_strokes: number | null;
  new_strokes: number | null;
  edited_by: string;
  edited_by_name: string;
  edited_at: string;
  subject_player_id: string | null;
  subject_name: string;
};

type EditRow = {
  id: number;
  hole_number: number;
  old_strokes: number | null;
  new_strokes: number | null;
  edited_by: string;
  edited_by_name: string | null;
  edited_at: string;
  player_id: string | null;
  guest_name: string | null;
  subject_name: string | null;
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

  // Confirm round belongs to event so we don't leak cross-event data.
  const round = await db
    .prepare("SELECT id FROM rounds WHERE id = ? AND event_id = ?")
    .get<{ id: number }>(rid, eventId);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const rows = await db
    .prepare(
      `SELECT se.id, se.hole_number, se.old_strokes, se.new_strokes,
              se.edited_by, eu.display_name AS edited_by_name, se.edited_at,
              se.player_id, se.guest_name,
              su.display_name AS subject_name
       FROM score_edits se
       LEFT JOIN users eu ON eu.id = se.edited_by
       LEFT JOIN users su ON su.id = se.player_id
       WHERE se.round_id = ?
       ORDER BY se.edited_at DESC, se.id DESC
       LIMIT 50`,
    )
    .all<EditRow>(rid);

  const entries: ScoreEditEntry[] = rows.map((r) => ({
    id: r.id,
    hole_number: r.hole_number,
    old_strokes: r.old_strokes,
    new_strokes: r.new_strokes,
    edited_by: r.edited_by,
    edited_by_name: r.edited_by_name ?? "?",
    edited_at: r.edited_at,
    subject_player_id: r.player_id,
    subject_name: r.subject_name ?? r.guest_name ?? "?",
  }));

  return NextResponse.json({ edits: entries });
}
