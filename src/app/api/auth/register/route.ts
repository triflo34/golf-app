import { NextResponse } from "next/server";
import {
  createSessionToken,
  createUser,
  findUserByUsername,
  setSessionCookie,
} from "@/lib/auth";

export async function POST(request: Request) {
  let body: { username?: unknown; password?: unknown; display_name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const displayName =
    typeof body.display_name === "string" ? body.display_name.trim() : "";

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

  if (await findUserByUsername(username)) {
    return NextResponse.json({ error: "Username taken" }, { status: 409 });
  }

  const user = await createUser({ username, password, display_name: displayName });
  const token = await createSessionToken(user.id);
  await setSessionCookie(token);

  return NextResponse.json({ user });
}
