import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  findUserByUsername,
  getCurrentUser,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { current?: unknown; next?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const current = typeof body.current === "string" ? body.current : "";
  const next = typeof body.next === "string" ? body.next : "";

  if (next.length < 4) {
    return NextResponse.json(
      { error: "New password must be at least 4 characters" },
      { status: 400 },
    );
  }

  const row = findUserByUsername(me.username);
  if (!row || !verifyPassword(current, row.password_hash)) {
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 401 },
    );
  }

  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    hashPassword(next),
    me.id,
  );

  return NextResponse.json({ ok: true });
}
