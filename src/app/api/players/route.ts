import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export type PlayerSummary = {
  key: string;
  name: string;
  is_guest: boolean;
  user_id: string | null;
};

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const users = db
    .prepare(
      `SELECT id, display_name FROM users
       WHERE hidden = 0
       ORDER BY display_name COLLATE NOCASE ASC`,
    )
    .all() as { id: string; display_name: string }[];

  const guests = db
    .prepare(
      `SELECT guest_name FROM scores
       WHERE guest_name IS NOT NULL
       GROUP BY LOWER(guest_name)
       ORDER BY LOWER(guest_name) ASC`,
    )
    .all() as { guest_name: string }[];

  const players: PlayerSummary[] = [
    ...users.map((u) => ({
      key: `u:${u.id}`,
      name: u.display_name,
      is_guest: false,
      user_id: u.id,
    })),
    ...guests.map((g) => ({
      key: `g:${g.guest_name.toLowerCase()}`,
      name: g.guest_name,
      is_guest: true,
      user_id: null,
    })),
  ];

  return NextResponse.json({ players });
}
