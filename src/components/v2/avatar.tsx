import { ReactNode } from "react";

type Tone = "sage" | "gold" | "coral" | "pink" | "purple" | "neutral" | "silver" | "bronze";

type Props = {
  /** Single character (or two) shown inside the circle. */
  initial: ReactNode;
  /** Color assignment for this player (see spec §2 player map). */
  tone?: Tone;
  /** Size in px. Common: 30 (live row), 34 (lb row), 50 (podium 2/3), 62 (podium 1). */
  size?: number;
  /** When true, render the 1st-place gold gradient + glow regardless of tone. */
  leader?: boolean;
  className?: string;
};

const TONE_BG: Record<Tone, string> = {
  sage: "#97c459",
  gold: "#d4af37",
  coral: "#d85a30",
  pink: "#d4537e",
  purple: "#7f77dd",
  neutral: "#3a4a3a",
  silver: "#b4b2a9",
  bronze: "#d85a30",
};

/**
 * v2 player avatar — colored circle with a serif initial. Spec §2 fixes the
 * player→color mapping (Tristian sage, Pappy gold, Tre coral, Tyler pink,
 * Jack purple) so muscle memory holds across leaderboards, rows, and charts.
 *
 * Use `leader` for the #1 podium / leaderboard row treatment (gold gradient +
 * glow). Otherwise pass `tone` matching the assigned player color.
 */
export function V2Avatar({
  initial,
  tone = "neutral",
  size = 34,
  leader = false,
  className = "",
}: Props) {
  const px = `${size}px`;
  // Initials inside a gold avatar read better in green-deep than off-white.
  const fg =
    leader || tone === "gold"
      ? "var(--v2-green-deep)"
      : tone === "silver" || tone === "bronze"
        ? "var(--v2-green-deep)"
        : "#fff";

  const background = leader
    ? "linear-gradient(135deg, #f0d977 0%, #c79b22 100%)"
    : tone === "silver"
      ? "linear-gradient(135deg, #d4d2c8 0%, #8f8d83 100%)"
      : tone === "bronze"
        ? "linear-gradient(135deg, #e88a5e 0%, #a0461f 100%)"
        : TONE_BG[tone];

  const boxShadow = leader ? "0 0 24px rgba(212, 175, 55, 0.4)" : undefined;

  // Initial sizing roughly scales with avatar size — keep it about 0.4× the
  // outer circle so glyphs sit cleanly inside.
  const fontSize = Math.max(11, Math.round(size * 0.42));

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{
        width: px,
        height: px,
        borderRadius: "50%",
        background,
        boxShadow,
        color: fg,
        fontFamily: "var(--font-fraunces), Georgia, serif",
        fontWeight: 600,
        fontSize: `${fontSize}px`,
        lineHeight: 1,
      }}
    >
      {initial}
    </span>
  );
}

/** Pick a tone from a player's display name. Used for guests / unmapped
 *  players so they still get a stable color rather than the neutral gray. */
export function toneForName(name: string | null | undefined): Tone {
  if (!name) return "neutral";
  const map: Record<string, Tone> = {
    tristian: "sage",
    pappy: "gold",
    tre: "coral",
    tyler: "pink",
    jack: "purple",
  };
  const key = name.trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (key in map) return map[key];
  // Stable fallback: hash the name and pick from the remaining tones.
  const tones: Tone[] = ["sage", "coral", "pink", "purple", "gold"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return tones[Math.abs(h) % tones.length];
}
