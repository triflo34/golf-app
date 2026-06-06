import { NextResponse } from "next/server";
import { db, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureCourseHoles } from "@/lib/events";

type RoundRow = {
  id: number;
  event_id: number;
  course_id: number;
  round_format: "individual" | "scramble";
  hole_count: number;
};

type ExistingTeamScore = {
  id: number;
  strokes: number;
};

export async function POST(
  request: Request,
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

  let body: { team_id?: unknown; hole_number?: unknown; strokes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const teamId = Number(body.team_id);
  const holeNumber = Number(body.hole_number);
  const clearing = body.strokes === null;
  const strokes = clearing ? null : Number(body.strokes);

  if (!Number.isInteger(teamId) || teamId <= 0) {
    return NextResponse.json({ error: "team_id is required" }, { status: 400 });
  }
  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    return NextResponse.json({ error: "hole_number must be 1–18" }, { status: 400 });
  }
  if (!clearing) {
    if (!Number.isInteger(strokes) || strokes! < 1 || strokes! > 20) {
      return NextResponse.json({ error: "strokes must be 1–20" }, { status: 400 });
    }
  }

  const round = await db
    .prepare(
      "SELECT id, event_id, course_id, round_format, hole_count FROM rounds WHERE id = ? AND event_id = ?",
    )
    .get<RoundRow>(rid, eventId);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  if (round.round_format !== "scramble") {
    return NextResponse.json(
      { error: "Round is not a scramble round" },
      { status: 400 },
    );
  }
  if (holeNumber > round.hole_count) {
    return NextResponse.json(
      { error: `Hole ${holeNumber} out of range` },
      { status: 400 },
    );
  }

  const team = await db
    .prepare(
      `SELECT id FROM scramble_teams WHERE id = ? AND round_id = ?`,
    )
    .get<{ id: number }>(teamId, rid);
  if (!team) {
    return NextResponse.json({ error: "Team not found for this round" }, { status: 404 });
  }

  // Permission: organizers can edit any team; everyone else may only edit a
  // team they belong to.
  const myParticipant = await db
    .prepare(
      `SELECT is_organizer FROM event_participants
       WHERE event_id = ? AND user_id = ?`,
    )
    .get<{ is_organizer: boolean }>(eventId, me.id);
  const isOrganizer = myParticipant?.is_organizer === true;
  if (!isOrganizer) {
    const membership = await db
      .prepare(
        `SELECT 1 AS ok FROM scramble_team_members WHERE team_id = ? AND user_id = ?`,
      )
      .get<{ ok: number }>(teamId, me.id);
    if (!membership) {
      return NextResponse.json(
        { error: "Only the event organizer or a team member can edit this team's score" },
        { status: 403 },
      );
    }
  }

  const holes = await ensureCourseHoles(round.course_id);
  const holeMeta = holes.find((h) => h.hole_number === holeNumber);
  const par = holeMeta?.par ?? 4;
  const handicapIndex = holeMeta?.handicap_index ?? null;
  const yardage = holeMeta?.yardage ?? null;

  await withTransaction(async (tx) => {
    const existing = await tx
      .prepare(
        `SELECT id, strokes FROM team_hole_scores
         WHERE team_id = ? AND hole_number = ?`,
      )
      .get<ExistingTeamScore>(teamId, holeNumber);

    if (clearing) {
      if (existing) {
        await tx
          .prepare("DELETE FROM team_hole_scores WHERE id = ?")
          .run(existing.id);
      }
      return;
    }

    if (existing) {
      if (existing.strokes === strokes) return;
      await tx
        .prepare(
          `UPDATE team_hole_scores
             SET strokes = ?, updated_by = ?, updated_at = now()
           WHERE id = ?`,
        )
        .run(strokes, me.id, existing.id);
    } else {
      await tx
        .prepare(
          `INSERT INTO team_hole_scores
             (team_id, hole_number, strokes, par, handicap_index, yardage, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          teamId,
          holeNumber,
          strokes,
          par,
          handicapIndex,
          yardage,
          me.id,
        );
    }
  });

  return NextResponse.json({ ok: true });
}
