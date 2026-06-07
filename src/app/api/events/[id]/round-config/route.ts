import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { RoundFormat } from "@/lib/types";

export type RoundConfigEntry = {
  format: RoundFormat;
  hole_count: number;
  // teams[i] = list of player user_ids on team i+1. Only used for scramble.
  teams: string[][];
};

async function isOrganizer(eventId: number, userId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM event_participants
       WHERE event_id = ? AND user_id = ? AND is_organizer = TRUE`,
    )
    .get<{ ok: number }>(eventId, userId);
  return Boolean(row);
}

// total_holes → the round skeleton (count + holes per round). 36 = two 18s.
function roundSkeleton(totalHoles: number): { hole_count: number }[] {
  if (totalHoles === 36) return [{ hole_count: 18 }, { hole_count: 18 }];
  if (totalHoles === 9) return [{ hole_count: 9 }];
  return [{ hole_count: 18 }];
}

function parseStored(v: unknown): RoundConfigEntry[] | null {
  if (v == null) return null;
  let parsed: unknown = v;
  if (typeof v === "string") {
    try {
      parsed = JSON.parse(v);
    } catch {
      return null;
    }
  }
  return Array.isArray(parsed) ? (parsed as RoundConfigEntry[]) : null;
}

// Default formats mirror the historical behaviour: a single round is individual,
// a 36-hole event is round 1 individual + round 2 scramble.
function defaultConfig(skeleton: { hole_count: number }[]): RoundConfigEntry[] {
  return skeleton.map((r, i) => ({
    format: i === 1 ? "scramble" : "individual",
    hole_count: r.hole_count,
    teams: [],
  }));
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

  const event = await db
    .prepare("SELECT total_holes, round_config, status FROM events WHERE id = ?")
    .get<{ total_holes: number; round_config: unknown; status: string }>(eventId);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const skeleton = roundSkeleton(event.total_holes ?? 18);
  const stored = parseStored(event.round_config);
  // Reconcile stored config against the current skeleton (hole counts win from
  // the skeleton; default any missing/short entries).
  const base = defaultConfig(skeleton);
  const config: RoundConfigEntry[] = base.map((d, i) => {
    const s = stored?.[i];
    return {
      format: s?.format === "scramble" || s?.format === "individual" ? s.format : d.format,
      hole_count: d.hole_count,
      teams: Array.isArray(s?.teams) ? (s!.teams as string[][]) : [],
    };
  });

  const players = await db
    .prepare(
      `SELECT ep.user_id, u.display_name
       FROM event_participants ep JOIN users u ON u.id = ep.user_id
       WHERE ep.event_id = ? AND ep.role = 'player'
       ORDER BY ep.seq ASC, u.display_name ASC`,
    )
    .all<{ user_id: string; display_name: string }>(eventId);

  return NextResponse.json({
    status: event.status,
    total_holes: event.total_holes ?? 18,
    rounds: config,
    players,
    locked: event.status !== "draft" && event.status !== "open",
  });
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
    return NextResponse.json({ error: "Only organizers can configure rounds" }, { status: 403 });
  }

  const event = await db
    .prepare("SELECT total_holes, status FROM events WHERE id = ?")
    .get<{ total_holes: number; status: string }>(eventId);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (event.status !== "draft" && event.status !== "open") {
    return NextResponse.json(
      { error: "Round setup is locked once the event has started" },
      { status: 409 },
    );
  }

  let body: { rounds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const skeleton = roundSkeleton(event.total_holes ?? 18);
  if (!Array.isArray(body.rounds) || body.rounds.length !== skeleton.length) {
    return NextResponse.json(
      { error: `Expected ${skeleton.length} round${skeleton.length === 1 ? "" : "s"}` },
      { status: 400 },
    );
  }

  // Valid player set for team membership checks.
  const playerRows = await db
    .prepare(
      `SELECT user_id FROM event_participants WHERE event_id = ? AND role = 'player'`,
    )
    .all<{ user_id: string }>(eventId);
  const validPlayers = new Set(playerRows.map((p) => p.user_id));

  const config: RoundConfigEntry[] = [];
  for (let i = 0; i < skeleton.length; i++) {
    const raw = body.rounds[i] as Record<string, unknown>;
    const format = raw?.format === "scramble" ? "scramble" : "individual";
    let teams: string[][] = [];
    if (format === "scramble") {
      const rawTeams = Array.isArray(raw?.teams) ? (raw!.teams as unknown[]) : [];
      const seen = new Set<string>();
      for (const t of rawTeams) {
        if (!Array.isArray(t)) continue;
        const members: string[] = [];
        for (const m of t) {
          if (typeof m !== "string" || !validPlayers.has(m)) {
            return NextResponse.json(
              { error: "Team members must be event players" },
              { status: 400 },
            );
          }
          if (seen.has(m)) {
            return NextResponse.json(
              { error: "Each player can only be on one team per round" },
              { status: 400 },
            );
          }
          seen.add(m);
          members.push(m);
        }
        if (members.length > 0) teams.push(members);
      }
    }
    config.push({ format, hole_count: skeleton[i].hole_count, teams });
  }

  await db
    .prepare("UPDATE events SET round_config = ?::jsonb WHERE id = ?")
    .run(JSON.stringify(config), eventId);

  return NextResponse.json({ ok: true, rounds: config });
}
