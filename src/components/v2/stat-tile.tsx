import { ReactNode } from "react";

type Props = {
  label: string;
  value: ReactNode;
  /** Optional trend indicator: "up" | "down" | undefined */
  trend?: "up" | "down";
  /** Color of the value: "gold" (default) | "green" | "white" */
  tone?: "gold" | "green" | "white";
};

/**
 * Big number + small label, used in the Profile stat row (Hero / Avg / Best in
 * the mockup). Inherits dark-mode tokens from globals.css.
 */
export function V2StatTile({ label, value, trend, tone = "gold" }: Props) {
  const toneClass =
    tone === "green"
      ? "text-[var(--v2-score)]"
      : tone === "white"
        ? "text-white"
        : "text-[var(--v2-accent)]";

  return (
    <div className="text-center">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--v2-muted)]">
        {label}
      </div>
      <div
        className={`mt-1 flex items-center justify-center gap-1 text-2xl font-bold ${toneClass}`}
      >
        <span>{value}</span>
        {trend === "up" && <span className="text-sm">▲</span>}
        {trend === "down" && <span className="text-sm">▼</span>}
      </div>
    </div>
  );
}
