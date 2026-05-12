import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!me.is_admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: {
    user_id?: unknown;
    hidden?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  const hidden = body.hidden === true;

  if (!userId) {
    return NextResponse.json({ error: "User ID is required" }, { status: 400 });
  }

  const target = await db
    .prepare("SELECT id FROM users WHERE id = ?")
    .get<{ id: string }>(userId);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await db
    .prepare("UPDATE users SET hidden = ? WHERE id = ?")
    .run(hidden ? 1 : 0, userId);

  return NextResponse.json({ user_id: userId, hidden });
}
