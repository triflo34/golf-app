import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    const store = await cookies();
    if (store.get(SESSION_COOKIE)) store.delete(SESSION_COOKIE);
  }
  return NextResponse.json({ user });
}
