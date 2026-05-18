import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export type FavoriteCourseRow = {
  id: number;
  name: string;
  city: string;
  state: string;
  holes: number;
  par: number;
};

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Table may not exist yet in environments where the migration hasn't run.
  try {
    const rows = await db
      .prepare(
        `SELECT c.id, c.name, c.city, c.state, c.holes, c.par
         FROM favorite_courses fc
         JOIN courses c ON c.id = fc.course_id
         WHERE fc.user_id = ?
         ORDER BY fc.created_at DESC`,
      )
      .all<FavoriteCourseRow>(me.id);
    return NextResponse.json({ favorites: rows });
  } catch (err) {
    console.warn("[favorites GET] failed (table missing?):", err);
    return NextResponse.json({ favorites: [] });
  }
}

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { course_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const courseId = Number(body.course_id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: "course_id required" }, { status: 400 });
  }
  try {
    await db
      .prepare(
        `INSERT INTO favorite_courses (user_id, course_id) VALUES (?, ?)
         ON CONFLICT (user_id, course_id) DO NOTHING`,
      )
      .run(me.id, courseId);
  } catch (err) {
    return NextResponse.json(
      { error: "favorites table not provisioned — run the favorites-and-recents migration", detail: String(err) },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const courseId = Number(url.searchParams.get("course_id"));
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: "course_id required" }, { status: 400 });
  }
  try {
    await db
      .prepare(
        `DELETE FROM favorite_courses WHERE user_id = ? AND course_id = ?`,
      )
      .run(me.id, courseId);
  } catch (err) {
    return NextResponse.json(
      { error: "favorites table not provisioned", detail: String(err) },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true });
}
