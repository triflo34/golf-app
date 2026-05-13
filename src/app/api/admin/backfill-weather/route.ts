import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { populateRoundWeather } from "@/lib/weather";

export const maxDuration = 60;

const NOMINATIM_DELAY_MS = 1100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!me.is_admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "25")));

  const rounds = await db
    .prepare(
      `SELECT id FROM rounds WHERE weather_fetched_at IS NULL ORDER BY id ASC LIMIT ?`,
    )
    .all<{ id: number }>(limit);

  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < rounds.length; i++) {
    const ok = await populateRoundWeather(rounds[i].id);
    if (ok) succeeded++;
    else failed++;
    if (i < rounds.length - 1) await sleep(NOMINATIM_DELAY_MS);
  }

  const remainingRow = await db
    .prepare(`SELECT COUNT(*)::int AS n FROM rounds WHERE weather_fetched_at IS NULL`)
    .get<{ n: number }>();

  return NextResponse.json({
    processed: rounds.length,
    succeeded,
    failed,
    remaining: remainingRow?.n ?? 0,
  });
}
