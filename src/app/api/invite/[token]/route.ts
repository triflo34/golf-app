import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { MAX_EVENT_PLAYERS } from "@/lib/invite";

export type InvitePreview =
  | { valid: false; reason: "not_found" | "revoked" | "expired" }
  | {
      valid: true;
      event: {
        id: number;
        name: string;
        course_name: string;
        start_date: string;
        end_date: string;
        status: string;
        player_count: number;
      };
      already_joined: boolean;
      joinable: boolean;
      full: boolean;
    };

type Row = {
  id: number;
  name: string;
  course_name: string;
  start_date: string;
  end_date: string;
  status: string;
  invite_expires_at: string | null;
  invite_revoked: boolean;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { token } = await params;

  const row = await db
    .prepare(
      `SELECT e.id, e.name, c.name AS course_name, e.start_date, e.end_date,
              e.status, e.invite_expires_at, e.invite_revoked
         FROM events e JOIN courses c ON c.id = e.course_id
        WHERE e.invite_token = ?`,
    )
    .get<Row>(token);

  if (!row) {
    return NextResponse.json({ valid: false, reason: "not_found" } satisfies InvitePreview);
  }
  if (row.invite_revoked) {
    return NextResponse.json({ valid: false, reason: "revoked" } satisfies InvitePreview);
  }
  if (row.invite_expires_at && new Date(row.invite_expires_at).getTime() < Date.now()) {
    return NextResponse.json({ valid: false, reason: "expired" } satisfies InvitePreview);
  }

  const count = await db
    .prepare(
      `SELECT COUNT(*)::int AS n FROM event_participants
        WHERE event_id = ? AND role = 'player'`,
    )
    .get<{ n: number }>(row.id);
  const playerCount = count?.n ?? 0;

  const already = await db
    .prepare(`SELECT 1 AS ok FROM event_participants WHERE event_id = ? AND user_id = ?`)
    .get<{ ok: number }>(row.id, me.id);

  const full = playerCount >= MAX_EVENT_PLAYERS;
  const joinable = (row.status === "draft" || row.status === "open") && !full;

  return NextResponse.json({
    valid: true,
    event: {
      id: row.id,
      name: row.name,
      course_name: row.course_name,
      start_date: row.start_date,
      end_date: row.end_date,
      status: row.status,
      player_count: playerCount,
    },
    already_joined: Boolean(already),
    joinable,
    full,
  } satisfies InvitePreview);
}
