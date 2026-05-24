import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const ACCEPTED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

// Generous server-side cap. Modern phone JPEGs are typically 2-4 MB; reject
// anything wildly larger before we burn vision tokens on it.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type ParsedPlayer = { strokes: (number | null)[] };
type ClaudeResult = { players: ParsedPlayer[] };

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Scorecard parsing not configured (missing ANTHROPIC_API_KEY)" },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const photo = form.get("photo");
  if (!(photo instanceof File)) {
    return NextResponse.json({ error: "photo field is required" }, { status: 400 });
  }
  if (photo.size === 0) {
    return NextResponse.json({ error: "photo is empty" }, { status: 400 });
  }
  if (photo.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "photo is too large (max 10 MB)" }, { status: 413 });
  }

  const mediaType = ACCEPTED_MEDIA_TYPES.has(photo.type)
    ? (photo.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif")
    : "image/jpeg";

  const holeCountRaw = Number(form.get("hole_count"));
  const holeCount: 9 | 18 =
    holeCountRaw === 9 || holeCountRaw === 18 ? holeCountRaw : 18;

  const playerNamesRaw = form.get("player_names");
  let playerNames: string[] = [];
  if (typeof playerNamesRaw === "string" && playerNamesRaw.length > 0) {
    try {
      const arr = JSON.parse(playerNamesRaw);
      if (Array.isArray(arr)) {
        playerNames = arr
          .filter((n): n is string => typeof n === "string")
          .map((n) => n.trim())
          .filter((n) => n.length > 0)
          .slice(0, 8);
      }
    } catch {
      // ignore — names are just a hint
    }
  }
  const playerCount = playerNames.length;

  // Per-hole pars from the course. Lets Claude positively identify and skip
  // the par row (which otherwise reads as a perfectly valid "player").
  let pars: number[] = [];
  const parsRaw = form.get("pars");
  if (typeof parsRaw === "string" && parsRaw.length > 0) {
    try {
      const arr = JSON.parse(parsRaw);
      if (Array.isArray(arr)) {
        pars = arr
          .map((n) => (typeof n === "number" ? Math.trunc(n) : NaN))
          .filter((n) => Number.isInteger(n) && n >= 3 && n <= 6);
      }
    } catch {
      // ignore — pars are a hint, not required
    }
  }

  const entryModeRaw = form.get("entry_mode");
  const entryMode: "strokes" | "to_par" =
    entryModeRaw === "to_par" ? "to_par" : "strokes";

  const base64 = Buffer.from(await photo.arrayBuffer()).toString("base64");

  const client = new Anthropic();

  let response;
  try {
    response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system:
        "You read paper golf scorecards from photos and extract per-player " +
        "per-hole stroke counts. You respond with a single JSON object and " +
        "nothing else — no prose, no markdown fences.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: buildPrompt(holeCount, playerCount, pars, entryMode),
            },
          ],
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Rate limited, try again shortly" }, { status: 429 });
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Vision API error: ${e.message}` },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: "Vision call failed" }, { status: 502 });
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return NextResponse.json(
      { error: "Vision returned no text content" },
      { status: 502 },
    );
  }

  const parsed = parseClaudeJson(textBlock.text);
  if (!parsed) {
    return NextResponse.json(
      {
        error: "Could not parse scorecard from photo",
        raw: textBlock.text.slice(0, 500),
      },
      { status: 422 },
    );
  }

  const players = normalizePlayers(parsed.players, holeCount, pars, entryMode);

  return NextResponse.json({
    hole_count: holeCount,
    players,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  });
}

function buildPrompt(
  holeCount: 9 | 18,
  playerCount: number,
  pars: number[],
  entryMode: "strokes" | "to_par",
): string {
  const rowHint =
    playerCount > 0
      ? `The user expects roughly ${playerCount} player row${playerCount === 1 ? "" : "s"}, ` +
        `but return however many you actually see on the card.`
      : `Return however many player rows you can see on the card.`;

  const parRowGuidance =
    pars.length >= holeCount
      ? `KNOWN PAR FOR EACH HOLE: ${pars.slice(0, holeCount).join(", ")} (total par ${pars.slice(0, holeCount).reduce((a, b) => a + b, 0)})\n` +
        `\n` +
        `Use this to identify non-player rows that you MUST skip:\n` +
        `- The PAR row exactly matches the numbers above (or labeled "PAR" / "M.PAR" / "W.PAR"). Skip it.\n` +
        `- The HANDICAP/HCP row contains a permutation of 1 through ${holeCount} (each used once, labeled "HCP" / "HDCP"). Skip it.\n` +
        `- TEE YARDAGE rows — there are typically 3 to 5 of these on a card (Blue/White/Red/Gold/Black tees etc.), each with 3-digit numbers like 145, 380, 510 and a 4-digit subtotal like 3297 or 6800. Skip ALL of them.\n` +
        `- The HOLE NUMBER row is 1, 2, 3, ... ${holeCount}. Skip it.\n`
      : `Skip any non-player rows: par row, handicap/HCP row, all tee yardage rows, and the hole-number row.\n`;

  const handwrittenHint =
    `STRONGEST SIGNAL — handwritten vs printed:\n` +
    `Player scores are almost always HANDWRITTEN in pen or pencil, in the lower portion of the card.\n` +
    `Tee yardages, par, HCP, and hole numbers are PRINTED (machine-printed text, often colored or boxed).\n` +
    `Only return rows whose cell values look HANDWRITTEN. If the photo shows only a blank template ` +
    `(no handwriting anywhere), return {"players": []}.\n`;

  const subtotalNote =
    holeCount === 18
      ? `CRITICAL — subtotal/total columns:\n` +
        `Most paper scorecards put a front-9 subtotal between hole 9 and hole 10 (often labeled OUT), ` +
        `a back-9 subtotal after hole 18 (often labeled IN), and an 18-hole total at the end. ` +
        `These are usually 2-digit numbers in the 30s-50s (like 42, 38, 45) or 70s-100s (like 78, 95). ` +
        `DO NOT put subtotal or total values into the strokes array.\n` +
        `Example — if you see "5 4 3 4 5 4 5 4 4 [38] 4 5 3 5 4 6 4 5 4 [40] [78]", ` +
        `return ONLY the 18 per-hole values, skipping the 38, 40, and 78.\n` +
        `The strokes array must contain EXACTLY 18 values, never 19 or 20.\n`
      : `If the row ends with a 9-hole total (like 42), skip it — ` +
        `the strokes array must contain EXACTLY 9 values.\n`;

  const valueGuidance =
    entryMode === "to_par"
      ? `VALUES ARE WRITTEN RELATIVE TO PAR (vs-par notation):\n` +
        `The player wrote scores as differences from par for each hole. Examples:\n` +
        `- "E" or "0" means even (par)\n` +
        `- "-1" or a number inside a circle means birdie (1 under par)\n` +
        `- "+1" or "1" inside a square means bogey (1 over par)\n` +
        `- "+2" means double bogey, "-2" means eagle, etc.\n` +
        `Return the RAW DIFF for each hole — integer between -5 and +10. ` +
        `Treat "E" as 0. Do NOT add par yourself; the server does that conversion.\n`
      : `VALUES ARE ABSOLUTE STROKE COUNTS:\n` +
        `Each cell is the literal number of strokes the player took on that hole. ` +
        `Return integers between 1 and 20.\n`;

  const entryRangeNote =
    entryMode === "to_par"
      ? `- Each entry is an integer between -5 and +10 (the diff from par), or null if blank/illegible.`
      : `- Each entry is an integer between 1 and 20, or null if that specific hole is blank/illegible.`;

  return (
    `This scorecard has ${holeCount} holes per player. ${rowHint}\n\n` +
    `IMPORTANT — always return rows when you can see numbers:\n` +
    `If you can see ANY player stroke numbers, return one row per visible player. ` +
    `Do NOT try to match player names — the user assigns each row afterward. ` +
    `List rows in top-to-bottom order as they appear on the card.\n` +
    `Only return {"players": []} if the photo truly has no player stroke numbers.\n\n` +
    handwrittenHint +
    `\n` +
    parRowGuidance +
    `\n` +
    valueGuidance +
    `\n` +
    subtotalNote +
    `\n` +
    `Return JSON with exactly this shape (no other fields):\n` +
    `{ "players": [ { "strokes": [...] } ] }\n\n` +
    `Rules:\n` +
    `- Each "strokes" array must have exactly ${holeCount} entries.\n` +
    entryRangeNote +
    `\n` +
    `- If a player only has the front 9 filled in, return null for holes 10-18 — but still include the row.\n` +
    `- Output ONLY the JSON object. No explanation, no markdown fences.`
  );
}

function parseClaudeJson(raw: string): ClaudeResult | null {
  const trimmed = raw.trim();
  const candidates = [trimmed];
  // Tolerate accidental markdown fences even though we asked for raw JSON.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) candidates.unshift(fenceMatch[1]);

  for (const c of candidates) {
    try {
      const obj = JSON.parse(c);
      if (obj && Array.isArray(obj.players)) return obj as ClaudeResult;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function normalizePlayers(
  raw: unknown[],
  holeCount: 9 | 18,
  pars: number[],
  entryMode: "strokes" | "to_par",
): { strokes: (number | null)[] }[] {
  const out: { strokes: (number | null)[] }[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const strokesRaw = (p as { strokes?: unknown }).strokes;
    if (!Array.isArray(strokesRaw)) continue;
    const strokes: (number | null)[] = [];
    for (let i = 0; i < holeCount; i++) {
      const v = strokesRaw[i];
      if (typeof v !== "number" || !Number.isInteger(v)) {
        strokes.push(null);
        continue;
      }
      // In to_par mode Claude returns the diff (e.g. -1 for birdie); convert
      // to absolute strokes using the known par for the hole. Fall back to
      // par 4 if we don't have par data for this hole.
      const abs = entryMode === "to_par" ? (pars[i] ?? 4) + v : v;
      strokes.push(abs >= 1 && abs <= 20 ? abs : null);
    }
    out.push({ strokes });
  }
  return out;
}
