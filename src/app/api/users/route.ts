import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const users = db
    .prepare(
      `SELECT id, username, display_name, avatar_url, is_admin, created_at
       FROM users ORDER BY display_name COLLATE NOCASE ASC`,
    )
    .all() as Array<{
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_admin: number;
    created_at: string;
  }>;

  return NextResponse.json({
    users: users.map((u) => ({ ...u, is_admin: u.is_admin === 1 })),
  });
}
