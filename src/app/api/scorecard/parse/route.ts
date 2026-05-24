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
              text: buildPrompt(holeCount, playerCount, playerNames),
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

  const players = normalizePlayers(parsed.players, holeCount);

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
  playerNames: string[],
): string {
  const expectedRows = playerCount > 0 ? playerCount : "a few";
  const namesLine =
    playerNames.length > 0
      ? `The user has these players entered (in this order): ${playerNames
          .map((n, i) => `${i + 1}. ${n}`)
          .join(", ")}. If the card shows names, match each row to the same person. Otherwise, return rows top-to-bottom as they appear on the card.\n`
      : `Order rows top-to-bottom as they appear on the card.\n`;

  const subtotalNote =
    holeCount === 18
      ? `CRITICAL — subtotal columns:\n` +
        `Most paper scorecards put a front-9 subtotal column between hole 9 and hole 10, ` +
        `and a back-9 subtotal column after hole 18, often with an 18-hole total at the end. ` +
        `These subtotals are usually 2-digit numbers in the 30s-50s (like 42, 38, 45). ` +
        `DO NOT include subtotal or total values in the strokes array. ` +
        `If you see something like [5,4,3,4,5,4,5,4,4, 38, 4,5,...] in a row, the 38 is the OUT subtotal — ` +
        `skip it. The strokes array must contain exactly 18 per-hole values, never 19 or 20.\n`
      : `If the card shows a 9-hole total at the end of the row (like 42), skip it — ` +
        `the strokes array must contain exactly 9 per-hole values.\n`;

  return (
    `This scorecard has ${holeCount} holes per player. Expect ${expectedRows} player row(s).\n\n` +
    namesLine +
    `\n` +
    subtotalNote +
    `\n` +
    `Return JSON with exactly this shape (no other fields):\n` +
    `{ "players": [ { "strokes": [...] } ] }\n\n` +
    `Rules:\n` +
    `- Each "strokes" array must have exactly ${holeCount} entries.\n` +
    `- Each entry is an integer 1-20, or null if the hole is blank or illegible.\n` +
    `- Ignore the par row, handicap row, yardage row, and any subtotal/total columns.\n` +
    `- If a player only has the front 9 filled in, use null for holes 10-18.\n` +
    `- If you cannot identify any player rows, return {"players": []}.\n` +
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
): { strokes: (number | null)[] }[] {
  const out: { strokes: (number | null)[] }[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const strokesRaw = (p as { strokes?: unknown }).strokes;
    if (!Array.isArray(strokesRaw)) continue;
    const strokes: (number | null)[] = [];
    for (let i = 0; i < holeCount; i++) {
      const v = strokesRaw[i];
      if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 20) {
        strokes.push(v);
      } else {
        strokes.push(null);
      }
    }
    out.push({ strokes });
  }
  return out;
}
