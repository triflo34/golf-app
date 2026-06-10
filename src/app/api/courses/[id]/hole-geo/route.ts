import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * User-set hole geometry (tee + green per hole) — the strategy map's primary
 * data source. Any signed-in member can set/update holes (small trusted
 * group; edits are attributed via updated_by).
 */

type Row = {
  hole_number: number;
  tee_lat: number;
  tee_lng: number;
  green_lat: number;
  green_lng: number;
  updated_at: string;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const courseId = Number(id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: "Invalid course id" }, { status: 400 });
  }

  const holes = await db
    .prepare(
      `SELECT hole_number, tee_lat, tee_lng, green_lat, green_lng, updated_at
       FROM course_hole_geo WHERE course_id = ? ORDER BY hole_number ASC`,
    )
    .all<Row>(courseId);

  return NextResponse.json({ holes });
}

function validCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" && typeof lng === "number" &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const courseId = Number(id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: "Invalid course id" }, { status: 400 });
  }

  const course = await db
    .prepare("SELECT 1 AS ok FROM courses WHERE id = ?")
    .get<{ ok: number }>(courseId);
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  let body: {
    hole_number?: unknown;
    tee?: { lat?: unknown; lng?: unknown };
    green?: { lat?: unknown; lng?: unknown };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const holeNumber = Number(body.hole_number);
  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 36) {
    return NextResponse.json({ error: "Invalid hole number" }, { status: 400 });
  }
  if (!validCoord(body.tee?.lat, body.tee?.lng) || !validCoord(body.green?.lat, body.green?.lng)) {
    return NextResponse.json({ error: "tee and green coordinates required" }, { status: 400 });
  }

  // Tee and green should be a plausible hole apart (40y–800y).
  const dLat = ((body.tee!.lat as number) - (body.green!.lat as number)) * 111_320;
  const midLat = (((body.tee!.lat as number) + (body.green!.lat as number)) / 2) * (Math.PI / 180);
  const dLng = ((body.tee!.lng as number) - (body.green!.lng as number)) * 111_320 * Math.cos(midLat);
  const distYd = Math.sqrt(dLat * dLat + dLng * dLng) * 1.0936133;
  if (distYd < 40 || distYd > 800) {
    return NextResponse.json(
      { error: `Tee and green are ${Math.round(distYd)}y apart — that doesn't look like a hole. Re-place the pins.` },
      { status: 400 },
    );
  }

  await db
    .prepare(
      `INSERT INTO course_hole_geo
         (course_id, hole_number, tee_lat, tee_lng, green_lat, green_lng, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, now())
       ON CONFLICT (course_id, hole_number) DO UPDATE SET
         tee_lat = EXCLUDED.tee_lat, tee_lng = EXCLUDED.tee_lng,
         green_lat = EXCLUDED.green_lat, green_lng = EXCLUDED.green_lng,
         updated_by = EXCLUDED.updated_by, updated_at = now()`,
    )
    .run(
      courseId,
      holeNumber,
      body.tee!.lat as number,
      body.tee!.lng as number,
      body.green!.lat as number,
      body.green!.lng as number,
      me.id,
    );

  return NextResponse.json({ ok: true });
}
