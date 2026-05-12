import { NextResponse } from "next/server";
import {
  createSessionToken,
  findUserByUsername,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";

export async function POST(request: Request) {
  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password required" },
      { status: 400 },
    );
  }

  const row = await findUserByUsername(username);
  if (!row || !verifyPassword(password, row.password_hash)) {
    return NextResponse.json(
      { error: "Invalid username or password" },
      { status: 401 },
    );
  }

  const token = await createSessionToken(row.id);
  await setSessionCookie(token);

  return NextResponse.json({
    user: {
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      is_admin: row.is_admin === 1,
      created_at: row.created_at,
    },
  });
}
