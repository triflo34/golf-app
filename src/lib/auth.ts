import "server-only";
import { cookies } from "next/headers";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { User } from "@/lib/types";

export const SESSION_COOKIE = "golf_session";
const SESSION_TTL_DAYS = 30;

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_admin: number;
  created_at: string;
};

function rowToUser(r: UserRow): User {
  return {
    id: r.id,
    username: r.username,
    display_name: r.display_name,
    avatar_url: r.avatar_url,
    is_admin: r.is_admin === 1,
    created_at: r.created_at,
  };
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

export function createUser(opts: {
  username: string;
  password: string;
  display_name?: string;
}): User {
  const id = randomUUID();
  const hash = hashPassword(opts.password);
  const displayName = opts.display_name?.trim() || opts.username;
  db.prepare(
    `INSERT INTO users (id, username, display_name, password_hash, is_admin)
     VALUES (?, ?, ?, ?, 0)`,
  ).run(id, opts.username, displayName, hash);
  const row = db
    .prepare(
      "SELECT id, username, display_name, avatar_url, is_admin, created_at FROM users WHERE id = ?",
    )
    .get(id) as UserRow;
  return rowToUser(row);
}

export function findUserByUsername(username: string): (UserRow & { password_hash: string }) | null {
  return (
    (db
      .prepare(
        "SELECT id, username, display_name, avatar_url, is_admin, created_at, password_hash FROM users WHERE username = ?",
      )
      .get(username) as (UserRow & { password_hash: string }) | undefined) ?? null
  );
}

export function createSessionToken(userId: string): string {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
  db.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
  ).run(token, userId, expiresAt);
  return token;
}

export function destroySession(token: string): void {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function getUserByToken(token: string): User | null {
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_admin, u.created_at, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`,
    )
    .get(token) as (UserRow & { expires_at: number }) | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    destroySession(token);
    return null;
  }
  return rowToUser(row);
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getUserByToken(token);
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
