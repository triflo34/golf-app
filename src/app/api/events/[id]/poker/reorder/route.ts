import { NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { PokerCard } from "@/lib/types";

type HandRow = { cards: unknown };

function asCards(v: unknown): PokerCard[] {
  if (Array.isArray(v)) return v as PokerCard[];
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? (parsed as PokerCard[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function POST(
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

  let body: { from?: unknown; to?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const from = Number(body.from);
  const to = Number(body.to);
  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    return NextResponse.json({ error: "from/to must be integers" }, { status: 400 });
  }
  if (from === to) return NextResponse.json({ ok: true });

  try {
    await withTransaction(async (tx) => {
      const hand = await tx
        .prepare(
          `SELECT cards FROM poker_hands WHERE event_id = ? AND player_id = ? FOR UPDATE`,
        )
        .get<HandRow>(eventId, me.id);
      if (!hand) throw new Error("Player hand not found");

      const cards = asCards(hand.cards);
      if (
        from < 0 ||
        to < 0 ||
        from >= cards.length ||
        to >= cards.length
      ) {
        throw new Error("from/to out of range");
      }

      const next = [...cards];
      [next[from], next[to]] = [next[to], next[from]];

      await tx
        .prepare(
          `UPDATE poker_hands SET cards = ?::jsonb
           WHERE event_id = ? AND player_id = ?`,
        )
        .run(JSON.stringify(next), eventId, me.id);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
