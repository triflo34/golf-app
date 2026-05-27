import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPlayerHandicapIndex } from "@/lib/player-handicap";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null, handicap: null });
  const handicap = await getPlayerHandicapIndex(user.id);
  return NextResponse.json({ user, handicap });
}
