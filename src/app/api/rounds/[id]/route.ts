import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export type RoundDetail = {
  id: number;
  course_id: number;
  course_name: string;
  played_at: string;
  notes: string | null;
  created_by: string;
  created_by_name: string;
  can_edit: boolean;
  scores: {
    id: number;
    player_id: string | null;
    guest_name: string | null;
    name: string;
    username: string | null;
    is_guest: boolean;
    gross_score: number;
    notes: string | null;
  }[];
};

type ScoreInput = {
  player_id?: string | null;
  guest_name?: string | null;
  gross_score: number;
  notes?: string | null;
};

function loadRound(id: number, currentUserId: string, isAdmin: boolean): RoundDetail | null {
  const round = db
    .prepare(
      `SELECT r.id, r.course_id, r.played_at, r.notes, r.created_by,
              c.name as course_name, u.display_name as created_by_name
       FROM rounds r
       JOIN courses c ON c.id = r.course_id
       JOIN users u ON u.id = r.created_by
       WHERE r.id = ?`,
    )
    .get(id) as
    | {
        id: number;
        course_id: number;
        played_at: string;
        notes: string | null;
        created_by: string;
        course_name: string;
        created_by_name: string;
      }
    | undefined;
  if (!round) return null;

  const scoreRows = db
    .prepare(
      `SELECT s.id, s.player_id, s.guest_name, s.gross_score, s.notes,
              u.display_name, u.username
       FROM scores s
       LEFT JOIN users u ON u.id = s.player_id
       WHERE s.round_id = ?
       ORDER BY s.gross_score ASC`,
    )
    .all(id) as Array<{
    id: number;
    player_id: string | null;
    guest_name: string | null;
    gross_score: number;
    notes: string | null;
    display_name: string | null;
    username: string | null;
  }>;

  return {
    ...round,
    can_edit: isAdmin || round.created_by === currentUserId,
    scores: scoreRows.map((s) => ({
      id: s.id,
      player_id: s.player_id,
      guest_name: s.guest_name,
      name: s.player_id ? s.display_name ?? "?" : s.guest_name ?? "?",
      username: s.username,
      is_guest: !s.player_id,
      gross_score: s.gross_score,
      notes: s.notes,
    })),
  };
}

function validateScores(rawScores: unknown):
  | { ok: true; scores: ScoreInput[] }
  | { ok: false; error: string } {
  if (!Array.isArray(rawScores) || rawScores.length === 0) {
    return { ok: false, error: "At least one player is required" };
  }
  if (rawScores.length > 8) {
    return { ok: false, error: "Max 8 players per round" };
  }

  const out: ScoreInput[] = [];
  const seenPlayer = new Set<string>();
  const seenGuest = new Set<string>();
  for (const s of rawScores as Record<string, unknown>[]) {
    const gross = Number(s.gross_score);
    if (!Number.isFinite(gross) || gross < 18 || gross > 200) {
      return { ok: false, error: "Score must be 18–200" };
    }
    const pid =
      typeof s.player_id === "string" && s.player_id.length > 0 ? s.player_id : null;
    const guest =
      typeof s.guest_name === "string" && s.guest_name.trim().length > 0
        ? s.guest_name.trim()
        : null;
    if ((pid && guest) || (!pid && !guest)) {
      return { ok: false, error: "Each score must have a registered player or guest name" };
    }
    if (pid) {
      if (seenPlayer.has(pid)) return { ok: false, error: "Duplicate player in round" };
      seenPlayer.add(pid);
    } else if (guest) {
      const k = guest.toLowerCase();
      if (seenGuest.has(k)) return { ok: false, error: "Duplicate guest name in round" };
      seenGuest.add(k);
    }
    out.push({
      player_id: pid,
      guest_name: guest,
      gross_score: Math.round(gross),
      notes:
        typeof s.notes === "string" && s.notes.trim().length > 0 ? s.notes.trim() : null,
    });
  }
  return { ok: true, scores: out };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }
  const round = loadRound(id, me.id, me.is_admin);
  if (!round) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(round);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const existing = db
    .prepare("SELECT created_by FROM rounds WHERE id = ?")
    .get(id) as { created_by: string } | undefined;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!me.is_admin && existing.created_by !== me.id) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  let body: {
    course_id?: unknown;
    played_at?: unknown;
    notes?: unknown;
    scores?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const courseId = Number(body.course_id);
  const playedAt = typeof body.played_at === "string" ? body.played_at : "";
  const notes =
    typeof body.notes === "string" && body.notes.trim().length > 0
      ? body.notes.trim()
      : null;

  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: "Course is required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(playedAt)) {
    return NextResponse.json({ error: "Date is required" }, { status: 400 });
  }

  const v = validateScores(body.scores);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const courseRow = db.prepare("SELECT id FROM courses WHERE id = ?").get(courseId);
  if (!courseRow) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  if (v.scores.some((s) => s.player_id)) {
    const ids = v.scores.map((s) => s.player_id).filter(Boolean) as string[];
    const placeholders = ids.map(() => "?").join(",");
    const found = db
      .prepare(`SELECT id FROM users WHERE id IN (${placeholders})`)
      .all(...ids) as { id: string }[];
    if (found.length !== ids.length) {
      return NextResponse.json({ error: "Unknown player" }, { status: 400 });
    }
  }

  const update = db.prepare(
    `UPDATE rounds SET course_id = ?, played_at = ?, notes = ? WHERE id = ?`,
  );
  const wipe = db.prepare("DELETE FROM scores WHERE round_id = ?");
  const insertScore = db.prepare(
    `INSERT INTO scores (round_id, player_id, guest_name, gross_score, notes)
     VALUES (?, ?, ?, ?, ?)`,
  );

  const tx = db.transaction(() => {
    update.run(courseId, playedAt, notes, id);
    wipe.run(id);
    for (const s of v.scores) {
      insertScore.run(id, s.player_id, s.guest_name, s.gross_score, s.notes);
    }
  });
  tx();

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }
  const existing = db
    .prepare("SELECT created_by FROM rounds WHERE id = ?")
    .get(id) as { created_by: string } | undefined;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!me.is_admin && existing.created_by !== me.id) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  db.prepare("DELETE FROM rounds WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
