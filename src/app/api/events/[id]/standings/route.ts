import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { loadEventStandings } from "@/lib/standings";
import { db } from "@/lib/db";

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

  const exists = await db
    .prepare("SELECT 1 AS ok FROM events WHERE id = ?")
    .get<{ ok: number }>(eventId);
  if (!exists) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  try {
    const standings = await loadEventStandings(eventId);
    return NextResponse.json(standings);
  } catch (err) {
    // Surface the real reason instead of an opaque 500 so the client can show
    // it (and so missing-column / data issues are diagnosable from the wire).
    console.error(`[standings] event ${eventId} failed:`, err);
    const message = err instanceof Error ? err.message : "Failed to load standings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
