import { NextResponse } from "next/server";
import { db, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!me.is_admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { source?: unknown; target?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const source = typeof body.source === "string" ? body.source.trim() : "";
  const target = typeof body.target === "string" ? body.target.trim() : "";

  if (!source || !target) {
    return NextResponse.json(
      { error: "Both source and target guest names are required" },
      { status: 400 },
    );
  }
  if (source.toLowerCase() === target.toLowerCase()) {
    return NextResponse.json(
      { error: "Source and target must be different guests" },
      { status: 400 },
    );
  }

  // Confirm both exist as guests
  const sourceExists = await db
    .prepare("SELECT 1 AS x FROM scores WHERE LOWER(guest_name) = LOWER(?) LIMIT 1")
    .get<{ x: number }>(source);
  if (!sourceExists) {
    return NextResponse.json({ error: `Guest "${source}" not found` }, { status: 404 });
  }
  const targetExists = await db
    .prepare("SELECT 1 AS x FROM scores WHERE LOWER(guest_name) = LOWER(?) LIMIT 1")
    .get<{ x: number }>(target);
  if (!targetExists) {
    return NextResponse.json({ error: `Guest "${target}" not found` }, { status: 404 });
  }

  // Reject if any round has both names — would violate uq_scores_round_guest.
  const conflicts = await db
    .prepare(
      `SELECT s1.round_id, r.played_at, c.name AS course_name
       FROM scores s1
       JOIN scores s2 ON s2.round_id = s1.round_id
       JOIN rounds r ON r.id = s1.round_id
       JOIN courses c ON c.id = r.course_id
       WHERE LOWER(s1.guest_name) = LOWER(?) AND LOWER(s2.guest_name) = LOWER(?)`,
    )
    .all<{ round_id: number; played_at: string; course_name: string }>(source, target);

  if (conflicts.length > 0) {
    return NextResponse.json(
      {
        error: `Both "${source}" and "${target}" appear in the same round. Resolve manually first.`,
        conflicts,
      },
      { status: 409 },
    );
  }

  const result = await withTransaction(async (tx) => {
    const r = await tx
      .prepare(
        `UPDATE scores SET guest_name = ? WHERE LOWER(guest_name) = LOWER(?)`,
      )
      .run(target, source);
    return r.rowCount;
  });

  return NextResponse.json({ merged: result, source, target });
}
