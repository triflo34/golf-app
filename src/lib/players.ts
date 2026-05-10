export type PlayerKey = string;

export type PlayerRef =
  | { kind: "user"; id: string }
  | { kind: "guest"; name: string };

export function keyForUser(id: string): PlayerKey {
  return `u:${id}`;
}

export function keyForGuest(name: string): PlayerKey {
  return `g:${name.toLowerCase()}`;
}

export function keyForScore(score: {
  player_id: string | null;
  guest_name: string | null;
}): PlayerKey {
  return score.player_id
    ? keyForUser(score.player_id)
    : keyForGuest(score.guest_name ?? "");
}

export function parseKey(key: string): PlayerRef | null {
  if (key.startsWith("u:")) return { kind: "user", id: key.slice(2) };
  if (key.startsWith("g:")) return { kind: "guest", name: key.slice(2) };
  return null;
}
