import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { UI_MODE_COOKIE } from "@/lib/ui-mode";

export async function POST(request: Request) {
  let body: { mode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const mode = body.mode === "v2" ? "v2" : "classic";
  const jar = await cookies();
  jar.set(UI_MODE_COOKIE, mode, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return NextResponse.json({ mode });
}
