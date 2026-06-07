import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { THEME_COOKIE } from "@/lib/theme";

export async function POST(request: Request) {
  let body: { theme?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const theme = body.theme === "light" ? "light" : "dark";
  const jar = await cookies();
  jar.set(THEME_COOKIE, theme, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return NextResponse.json({ theme });
}
