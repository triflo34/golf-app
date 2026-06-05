import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { MAX_EVENT_PLAYERS } from "@/lib/invite";

type Row = {
  id: number;
  status: string;
  invite_expires_at: string | null;
  invite_revoked: boolean;
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { token } = await params;

  const row = await db
    .prepare(
      `SELECT id, status, invite_expires_at, invite_revoked
         FROM events WHERE invite_token = ?`,
    )
    .get<Row>(token);

  if (!row) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (row.invite_revoked) {
    return NextResponse.json({ error: "This invite has been revoked" }, { status: 410 });
  }
  if (row.invite_expires_at && new Date(row.invite_expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "This invite has expired" }, { status: 410 });
  }

  // Already in? Idempotent — just point them at the event.
  const already = await db
    .prepare(`SELECT 1 AS ok FROM event_participants WHERE event_id = ? AND user_id = ?`)
    .get<{ ok: number }>(row.id, me.id);
  if (already) return NextResponse.json({ event_id: row.id, already: true });

  if (row.status !== "draft" && row.status !== "open") {
    return NextResponse.json(
      { error: "This event's roster is locked." },
      { status: 409 },
    );
  }

  const count = await db
    .prepare(
      `SELECT COUNT(*)::int AS n FROM event_participants
        WHERE event_id = ? AND role = 'player'`,
    )
    .get<{ n: number }>(row.id);
  if ((count?.n ?? 0) >= MAX_EVENT_PLAYERS) {
    return NextResponse.json(
      { error: `This event is full (${MAX_EVENT_PLAYERS} players).` },
      { status: 409 },
    );
  }

  const maxSeq = await db
    .prepare(`SELECT COALESCE(MAX(seq), 0)::int AS m FROM event_participants WHERE event_id = ?`)
    .get<{ m: number }>(row.id);
  const nextSeq = (maxSeq?.m ?? 0) + 1;

  await db
    .prepare(
      `INSERT INTO event_participants (event_id, user_id, role, seq)
       VALUES (?, ?, 'player', ?)
       ON CONFLICT (event_id, user_id) DO NOTHING`,
    )
    .run(row.id, me.id, nextSeq);

  return NextResponse.json({ event_id: row.id });
}
