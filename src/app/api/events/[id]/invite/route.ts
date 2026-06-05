import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { generateInviteToken, INVITE_TTL_DAYS } from "@/lib/invite";

async function isOrganizer(eventId: number, userId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM event_participants
       WHERE event_id = ? AND user_id = ? AND is_organizer = TRUE`,
    )
    .get<{ ok: number }>(eventId, userId);
  return Boolean(row);
}

function parseEventId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export type InviteState = {
  token: string | null;
  expires_at: string | null;
  revoked: boolean;
};

// Read the current invite state for an event. Organizer only.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const eventId = parseEventId(id);
  if (eventId == null) return NextResponse.json({ error: "Invalid event id" }, { status: 400 });

  if (!(await isOrganizer(eventId, me.id))) {
    return NextResponse.json({ error: "Only organizers can manage invites" }, { status: 403 });
  }

  const row = await db
    .prepare(
      `SELECT invite_token, invite_expires_at, invite_revoked
         FROM events WHERE id = ?`,
    )
    .get<{ invite_token: string | null; invite_expires_at: string | null; invite_revoked: boolean }>(
      eventId,
    );

  const expired =
    row?.invite_expires_at != null &&
    new Date(row.invite_expires_at).getTime() < Date.now();

  return NextResponse.json({
    token: row?.invite_revoked || expired ? null : row?.invite_token ?? null,
    expires_at: row?.invite_expires_at ?? null,
    revoked: Boolean(row?.invite_revoked),
  } satisfies InviteState);
}

// Generate (or rotate) the invite link for an event. Organizer only.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const eventId = parseEventId(id);
  if (eventId == null) return NextResponse.json({ error: "Invalid event id" }, { status: 400 });

  if (!(await isOrganizer(eventId, me.id))) {
    return NextResponse.json({ error: "Only organizers can manage invites" }, { status: 403 });
  }

  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString();

  await db
    .prepare(
      `UPDATE events
          SET invite_token = ?, invite_expires_at = ?, invite_revoked = FALSE
        WHERE id = ?`,
    )
    .run(token, expiresAt, eventId);

  return NextResponse.json({ token, expires_at: expiresAt });
}

// Revoke the current invite link (kills it without issuing a new one).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const eventId = parseEventId(id);
  if (eventId == null) return NextResponse.json({ error: "Invalid event id" }, { status: 400 });

  if (!(await isOrganizer(eventId, me.id))) {
    return NextResponse.json({ error: "Only organizers can manage invites" }, { status: 403 });
  }

  await db.prepare(`UPDATE events SET invite_revoked = TRUE WHERE id = ?`).run(eventId);
  return NextResponse.json({ ok: true });
}
