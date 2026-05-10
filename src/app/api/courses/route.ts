import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { Course } from "@/lib/types";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  const rows = q
    ? (db
        .prepare(
          `SELECT * FROM courses
           WHERE name LIKE ? OR city LIKE ?
           ORDER BY name ASC LIMIT 200`,
        )
        .all(`%${q}%`, `%${q}%`) as Course[])
    : (db
        .prepare("SELECT * FROM courses ORDER BY name ASC LIMIT 200")
        .all() as Course[]);

  return NextResponse.json({ courses: rows });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  const address =
    typeof body.address === "string" && body.address.trim() ? body.address.trim() : null;
  const state =
    typeof body.state === "string" && body.state.trim() ? body.state.trim() : "MI";
  const phone =
    typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null;
  const website =
    typeof body.website === "string" && body.website.trim() ? body.website.trim() : null;
  const par = Number(body.par);
  const holes = Number(body.holes ?? 18);
  const slope =
    body.slope_rating === "" || body.slope_rating == null
      ? null
      : Number(body.slope_rating);
  const rating =
    body.course_rating === "" || body.course_rating == null
      ? null
      : Number(body.course_rating);

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!city) return NextResponse.json({ error: "City is required" }, { status: 400 });
  if (!Number.isInteger(par) || par < 27 || par > 100) {
    return NextResponse.json({ error: "Par must be 27–100" }, { status: 400 });
  }
  if (!Number.isInteger(holes) || (holes !== 9 && holes !== 18)) {
    return NextResponse.json({ error: "Holes must be 9 or 18" }, { status: 400 });
  }
  if (slope != null && (!Number.isFinite(slope) || slope < 55 || slope > 155)) {
    return NextResponse.json({ error: "Slope must be 55–155" }, { status: 400 });
  }
  if (rating != null && (!Number.isFinite(rating) || rating < 25 || rating > 80)) {
    return NextResponse.json({ error: "Course rating must be 25–80" }, { status: 400 });
  }

  const existing = db
    .prepare(
      "SELECT id FROM courses WHERE LOWER(name) = LOWER(?) AND LOWER(city) = LOWER(?)",
    )
    .get(name, city) as { id: number } | undefined;
  if (existing) {
    return NextResponse.json(
      { error: "A course with that name and city already exists", id: existing.id },
      { status: 409 },
    );
  }

  const info = db
    .prepare(
      `INSERT INTO courses (name, address, city, state, holes, par, slope_rating, course_rating, website, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(name, address, city, state, holes, par, slope, rating, website, phone);

  return NextResponse.json({ id: info.lastInsertRowid });
}
