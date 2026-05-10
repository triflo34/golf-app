import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  hidden: number;
};

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!me.is_admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const users = db
    .prepare(
      "SELECT id, username, display_name, hidden FROM users ORDER BY display_name ASC",
    )
    .all() as UserRow[];

  return NextResponse.json({ users: users.map((u) => ({ ...u, hidden: u.hidden === 1 })) });
}
