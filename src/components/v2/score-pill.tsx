import { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** "green" = solid round, "gold" = personal best-ish, "red" = rough day. */
  tone?: "green" | "gold" | "red";
  className?: string;
};

/**
 * v2 score pill (spec §5.6). Tinted rounded chip with a serif number inside,
 * used on home / profile / round rows to show gross scores. Color follows
 * golf logic — low is good, so sage for great, red for rough.
 */
export function V2ScorePill({ children, tone = "green", className = "" }: Props) {
  const cls =
    tone === "gold"
      ? "v2-score-gold"
      : tone === "red"
        ? "v2-score-red"
        : "v2-score-green";
  return (
    <span
      className={`inline-flex min-w-[2.25rem] items-center justify-center rounded-[14px] px-2 py-0.5 leading-none ${cls} ${className}`}
      style={{
        fontFamily: "var(--font-fraunces), Georgia, serif",
        fontSize: "15px",
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

/** Pick a tone from a raw gross score relative to par. Convenient default for
 *  callers that don't want to hand-pick a color. */
export function scorePillToneForVsPar(vsPar: number): "green" | "gold" | "red" {
  if (vsPar <= -2) return "gold"; // eagle+ — celebrate
  if (vsPar <= 2) return "green"; // birdie / par / bogey-ish — solid
  return "red"; // rough day
}
