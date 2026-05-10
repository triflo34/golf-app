import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { findUserByUsername, getCurrentUser, hashPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!me.is_admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: {
    guest_name?: unknown;
    username?: unknown;
    display_name?: unknown;
    password?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const guestName =
    typeof body.guest_name === "string" ? body.guest_name.trim() : "";
  const username =
    typeof body.username === "string" ? body.username.trim() : "";
  const displayName =
    typeof body.display_name === "string" && body.display_name.trim()
      ? body.display_name.trim()
      : guestName;
  const password = typeof body.password === "string" ? body.password : "";

  if (!guestName) {
    return NextResponse.json({ error: "Guest name is required" }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_]{2,20}$/.test(username)) {
    return NextResponse.json(
      { error: "Username must be 2–20 letters, numbers, or underscores" },
      { status: 400 },
    );
  }
  if (password.length < 4) {
    return NextResponse.json(
      { error: "Password must be at least 4 characters" },
      { status: 400 },
    );
  }
  if (findUserByUsername(username)) {
    return NextResponse.json({ error: "Username taken" }, { status: 409 });
  }

  // Verify the guest actually exists in scores.
  const guestExists = db
    .prepare(
      "SELECT 1 AS x FROM scores WHERE LOWER(guest_name) = LOWER(?) LIMIT 1",
    )
    .get(guestName) as { x: number } | undefined;
  if (!guestExists) {
    return NextResponse.json({ error: "Guest not found" }, { status: 404 });
  }

  const id = randomUUID();
  const hash = hashPassword(password);

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO users (id, username, display_name, password_hash, is_admin)
       VALUES (?, ?, ?, ?, 0)`,
    ).run(id, username, displayName, hash);

    db.prepare(
      `UPDATE scores
       SET player_id = ?, guest_name = NULL
       WHERE LOWER(guest_name) = LOWER(?)`,
    ).run(id, guestName);
  });

  tx();

  return NextResponse.json({ id, username, display_name: displayName });
}
