import { NextResponse } from "next/server";
import { db, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { SideGame, SideGameKind } from "@/lib/types";

const VALID_KINDS: SideGameKind[] = [
  "poker",
  "best18",
  "worst18",
  "most_same",
  "scramble_winners",
];

async function isOrganizer(eventId: number, userId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM event_participants
       WHERE event_id = ? AND user_id = ? AND role = 'organizer'`,
    )
    .get<{ ok: number }>(eventId, userId);
  return Boolean(row);
}

async function eventStatus(eventId: number): Promise<string | null> {
  const row = await db
    .prepare("SELECT status FROM events WHERE id = ?")
    .get<{ status: string }>(eventId);
  return row?.status ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  const rows = await db
    .prepare(
      `SELECT id, event_id, kind, pot_cents, config FROM side_games
       WHERE event_id = ? ORDER BY id ASC`,
    )
    .all<SideGame>(eventId);

  return NextResponse.json({ side_games: rows });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  if (!(await isOrganizer(eventId, me.id))) {
    return NextResponse.json({ error: "Only organizers can configure side games" }, { status: 403 });
  }

  const status = await eventStatus(eventId);
  if (status !== "draft" && status !== "open") {
    return NextResponse.json(
      { error: "Side games are locked once the event is In Progress" },
      { status: 409 },
    );
  }

  let body: { side_games?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!Array.isArray(body.side_games)) {
    return NextResponse.json({ error: "side_games array required" }, { status: 400 });
  }

  type Entry = { kind: SideGameKind; pot_cents: number };
  const entries: Entry[] = [];
  const seen = new Set<string>();
  for (const raw of body.side_games as Record<string, unknown>[]) {
    const kind = typeof raw.kind === "string" ? raw.kind : "";
    if (!VALID_KINDS.includes(kind as SideGameKind)) {
      return NextResponse.json({ error: `Invalid kind: ${kind}` }, { status: 400 });
    }
    if (seen.has(kind)) {
      return NextResponse.json({ error: `Duplicate kind: ${kind}` }, { status: 400 });
    }
    seen.add(kind);
    const pot = Math.max(0, Math.round(Number(raw.pot_cents) || 0));
    entries.push({ kind: kind as SideGameKind, pot_cents: pot });
  }

  await withTransaction(async (tx) => {
    await tx.prepare("DELETE FROM side_games WHERE event_id = ?").run(eventId);
    for (const e of entries) {
      await tx
        .prepare(
          `INSERT INTO side_games (event_id, kind, pot_cents) VALUES (?, ?, ?)`,
        )
        .run(eventId, e.kind, e.pot_cents);
    }
  });

  return NextResponse.json({ ok: true });
}
