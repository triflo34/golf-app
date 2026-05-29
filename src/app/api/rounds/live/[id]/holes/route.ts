import { NextResponse } from "next/server";
import { db, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureCourseHoles } from "@/lib/events";

type RoundRow = {
  id: number;
  hole_count: number;
  nine_played: "front" | "back" | null;
  course_id: number;
  status: "live" | "final";
};

type ExistingScore = {
  id: number;
  strokes: number;
};

type RosterMatch = {
  player_id: string | null;
  guest_name: string | null;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const rid = Number(id);
  if (!Number.isInteger(rid)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: {
    player_id?: unknown;
    guest_name?: unknown;
    hole_number?: unknown;
    strokes?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const rawPlayerId =
    typeof body.player_id === "string" && body.player_id.length > 0
      ? body.player_id
      : null;
  const rawGuestName =
    typeof body.guest_name === "string" && body.guest_name.trim().length > 0
      ? body.guest_name.trim()
      : null;
  if ((rawPlayerId && rawGuestName) || (!rawPlayerId && !rawGuestName)) {
    return NextResponse.json(
      { error: "Provide exactly one of player_id or guest_name" },
      { status: 400 },
    );
  }
  const holeNumber = Number(body.hole_number);
  const clearing = body.strokes === null;
  const strokes = clearing ? null : Number(body.strokes);

  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    return NextResponse.json(
      { error: "hole_number must be 1–18" },
      { status: 400 },
    );
  }
  if (!clearing) {
    if (
      !Number.isFinite(strokes) ||
      !Number.isInteger(strokes) ||
      strokes! < 1 ||
      strokes! > 20
    ) {
      return NextResponse.json(
        { error: "strokes must be 1–20" },
        { status: 400 },
      );
    }
  }

  const round = await db
    .prepare(
      "SELECT id, hole_count, nine_played, course_id, status FROM rounds WHERE id = ?",
    )
    .get<RoundRow>(rid);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  if (round.status !== "live") {
    return NextResponse.json(
      { error: "Round is not live; cannot edit holes" },
      { status: 400 },
    );
  }

  // Resolve the hole-number range for the round.
  const minHole =
    round.hole_count === 9 && round.nine_played === "back" ? 10 : 1;
  const maxHole =
    round.hole_count === 9
      ? round.nine_played === "back"
        ? 18
        : 9
      : 18;
  if (holeNumber < minHole || holeNumber > maxHole) {
    return NextResponse.json(
      { error: `Hole ${holeNumber} out of range for this round` },
      { status: 400 },
    );
  }

  // Verify the identity is on the round's roster.
  const rosterRow = await db
    .prepare(
      rawPlayerId
        ? `SELECT player_id, guest_name FROM round_players
            WHERE round_id = ? AND player_id = ?`
        : `SELECT player_id, guest_name FROM round_players
            WHERE round_id = ? AND lower(guest_name) = lower(?)`,
    )
    .get<RosterMatch>(rid, (rawPlayerId ?? rawGuestName)!);
  if (!rosterRow) {
    return NextResponse.json(
      { error: "Player is not on this round's roster" },
      { status: 400 },
    );
  }
  const playerId = rosterRow.player_id;
  const guestName = rosterRow.guest_name;

  const holes = await ensureCourseHoles(round.course_id);
  const holeMeta = holes.find((h) => h.hole_number === holeNumber);
  const par = holeMeta?.par ?? 4;
  const handicapIndex = holeMeta?.handicap_index ?? null;
  const yardage = holeMeta?.yardage ?? null;

  await withTransaction(async (tx) => {
    const existing = await tx
      .prepare(
        playerId
          ? `SELECT id, strokes FROM hole_scores
              WHERE round_id = ? AND player_id = ? AND hole_number = ?`
          : `SELECT id, strokes FROM hole_scores
              WHERE round_id = ? AND guest_name = ? AND hole_number = ?`,
      )
      .get<ExistingScore>(rid, (playerId ?? guestName)!, holeNumber);

    if (clearing) {
      if (existing) {
        await tx
          .prepare("DELETE FROM hole_scores WHERE id = ?")
          .run(existing.id);
        await tx
          .prepare(
            `INSERT INTO score_edits
               (hole_score_id, round_id, player_id, guest_name, hole_number,
                old_strokes, new_strokes, edited_by)
             VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
          )
          .run(
            null,
            rid,
            playerId,
            guestName,
            holeNumber,
            existing.strokes,
            me.id,
          );
      }
      return;
    }

    if (existing) {
      if (existing.strokes === strokes) return;
      await tx
        .prepare(
          `UPDATE hole_scores
              SET strokes = ?, updated_by = ?, updated_at = now()
            WHERE id = ?`,
        )
        .run(strokes, me.id, existing.id);
      await tx
        .prepare(
          `INSERT INTO score_edits
             (hole_score_id, round_id, player_id, guest_name, hole_number,
              old_strokes, new_strokes, edited_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          existing.id,
          rid,
          playerId,
          guestName,
          holeNumber,
          existing.strokes,
          strokes,
          me.id,
        );
    } else {
      const inserted = await tx
        .prepare(
          `INSERT INTO hole_scores
             (round_id, player_id, guest_name, hole_number, strokes,
              par, handicap_index, yardage, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING id`,
        )
        .get<{ id: number }>(
          rid,
          playerId,
          guestName,
          holeNumber,
          strokes,
          par,
          handicapIndex,
          yardage,
          me.id,
        );
      await tx
        .prepare(
          `INSERT INTO score_edits
             (hole_score_id, round_id, player_id, guest_name, hole_number,
              old_strokes, new_strokes, edited_by)
           VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
        )
        .run(
          inserted!.id,
          rid,
          playerId,
          guestName,
          holeNumber,
          strokes,
          me.id,
        );
    }
  });

  return NextResponse.json({ ok: true });
}
