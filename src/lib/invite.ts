import { randomBytes } from "crypto";

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Random, unguessable invite token (default ~131 bits over 22 base62 chars). */
export function generateInviteToken(len = 22): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** How long a freshly-generated invite link stays valid. */
export const INVITE_TTL_DAYS = 30;

export const MAX_EVENT_PLAYERS = 8;
