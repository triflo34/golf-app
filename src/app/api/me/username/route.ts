import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, findUserByUsername } from "@/lib/auth";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    username?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";

  if (!/^[a-zA-Z0-9_]{2,20}$/.test(username)) {
    return NextResponse.json(
      { error: "Username must be 2–20 letters, numbers, or underscores" },
      { status: 400 },
    );
  }

  if (username === user.username) {
    return NextResponse.json({ error: "That's already your username" }, { status: 400 });
  }

  if (await findUserByUsername(username)) {
    return NextResponse.json({ error: "Username taken" }, { status: 409 });
  }

  await db.prepare("UPDATE users SET username = ? WHERE id = ?").run(username, user.id);

  return NextResponse.json({ username });
}
