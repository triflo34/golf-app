import { ReactNode } from "react";

type Props = {
  label: string;
  value: ReactNode;
  /** Optional trend indicator: "up" (sage) or "down" (coral). */
  trend?: "up" | "down";
  /** Color of the value: "gold" (default) | "sage" | "white" | "coral".
   *  "green" is a legacy alias for "sage" — older v2 callsites still use it. */
  tone?: "gold" | "sage" | "green" | "white" | "coral";
  /** Tiny sub-line beneath the value (e.g. "+0.3 this month"). */
  sub?: ReactNode;
};

/**
 * Big number + small label, used in the Profile stat trio (Index / Rounds /
 * Best per spec §7.5) and in the Event banner figures.
 *
 * - Label: 10px UPPERCASE, dim, letter-spaced.
 * - Value: Fraunces 22px, color-coded.
 * - Trend: small triangle next to the value.
 */
export function V2StatTile({
  label,
  value,
  trend,
  tone = "gold",
  sub,
}: Props) {
  const toneClass =
    tone === "sage" || tone === "green"
      ? "text-[var(--v2-sage)]"
      : tone === "white"
        ? "text-white"
        : tone === "coral"
          ? "text-[var(--v2-coral)]"
          : "text-[var(--v2-gold)]";

  return (
    <div className="text-center">
      <div
        className="text-[10px] font-semibold uppercase text-[var(--v2-text-dim)]"
        style={{
          fontFamily: "var(--font-outfit), system-ui, sans-serif",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      <div
        className={`mt-1 flex items-baseline justify-center gap-1 ${toneClass}`}
        style={{
          fontFamily: "var(--font-fraunces), Georgia, serif",
          fontSize: "22px",
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        <span>{value}</span>
        {trend === "up" && (
          <span className="text-[12px] text-[var(--v2-sage)]">▲</span>
        )}
        {trend === "down" && (
          <span className="text-[12px] text-[var(--v2-coral)]">▼</span>
        )}
      </div>
      {sub && (
        <div
          className="mt-1 text-[9.5px] text-[var(--v2-text-faint)]"
          style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
