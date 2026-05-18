import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export type RecentSearchRow = {
  query: string;
  searched_at: string;
};

const MAX_PER_USER = 20;

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const rows = await db
      .prepare(
        `SELECT DISTINCT ON (query) query, searched_at
         FROM recent_course_searches
         WHERE user_id = ?
         ORDER BY query, searched_at DESC`,
      )
      .all<RecentSearchRow>(me.id);
    rows.sort((a, b) => b.searched_at.localeCompare(a.searched_at));
    return NextResponse.json({ recent: rows.slice(0, 10) });
  } catch (err) {
    console.warn("[recent-searches GET] failed (table missing?):", err);
    return NextResponse.json({ recent: [] });
  }
}

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { query?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (query.length < 2 || query.length > 100) {
    return NextResponse.json({ error: "query length 2..100" }, { status: 400 });
  }
  try {
    await db
      .prepare(
        `INSERT INTO recent_course_searches (user_id, query) VALUES (?, ?)`,
      )
      .run(me.id, query);
    // Cap the per-user log so it doesn't grow forever.
    await db
      .prepare(
        `DELETE FROM recent_course_searches
         WHERE user_id = ?
           AND id NOT IN (
             SELECT id FROM recent_course_searches
             WHERE user_id = ?
             ORDER BY searched_at DESC
             LIMIT ?
           )`,
      )
      .run(me.id, me.id, MAX_PER_USER);
  } catch (err) {
    console.warn("[recent-searches POST] failed (table missing?):", err);
    // Best-effort logging — don't block the search if the table isn't there yet.
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await db
      .prepare(`DELETE FROM recent_course_searches WHERE user_id = ?`)
      .run(me.id);
  } catch (err) {
    console.warn("[recent-searches DELETE] failed:", err);
  }
  return NextResponse.json({ ok: true });
}
