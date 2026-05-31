import { ReactNode } from "react";
import { V2Avatar, toneForName } from "@/components/v2/avatar";

type Props = {
  rank: number;
  /** When true, T-prefix the rank ("T2") and skip leader styling. */
  tied?: boolean;
  /** When true, this is the current user — sage wash + YOU pill. */
  isYou?: boolean;
  /** When true, this is rank 1 — gold avatar gradient + glow. */
  isLeader?: boolean;
  name: string;
  /** Optional player initial override (defaults to first letter of name). */
  initial?: string;
  /** Meta line under the name: "6 rounds · 4 wins · best 76". Pass null/undefined to omit. */
  meta?: ReactNode;
  /** Average score (or any "primary stat" number). Serif 18. */
  primaryValue: ReactNode;
  primaryLabel?: string;
  /** Color the primary value sage (improved) or amber (worse). Default = white. */
  primaryTone?: "sage" | "amber" | "white" | "gold";
  /** Points (or secondary stat). Serif 18 gold. */
  secondaryValue?: ReactNode;
  secondaryLabel?: string;
  /** Optional onClick to make the whole row a button. */
  onClick?: () => void;
  className?: string;
};

/**
 * v2 leaderboard row — spec §5.4.
 *   [rank 20px · avatar 34px · name+meta (flex) · avg 44px right · pts 28px right]
 *
 * Leader gets the gold-gradient avatar treatment via V2Avatar's `leader`
 * prop. The "you" variant applies a sage left-to-right wash.
 *
 * The two-value layout (primary + secondary) is the common case (Avg / Pts).
 * For rows with only one stat, pass just primaryValue.
 */
export function V2LeaderboardRow({
  rank,
  tied = false,
  isYou = false,
  isLeader = false,
  name,
  initial,
  meta,
  primaryValue,
  primaryLabel = "avg",
  primaryTone = "white",
  secondaryValue,
  secondaryLabel = "pts",
  onClick,
  className = "",
}: Props) {
  const tone = isLeader ? "gold" : toneForName(name);
  const rowClass = `v2-lb-row ${isYou ? "v2-lb-row-you" : ""} ${className}`;
  const primaryColor =
    primaryTone === "sage"
      ? "text-[var(--v2-sage)]"
      : primaryTone === "amber"
        ? "text-[var(--v2-amber-warn)]"
        : primaryTone === "gold"
          ? "text-[var(--v2-gold)]"
          : "text-[var(--v2-text)]";

  const rankLabel = tied ? `T${rank}` : `${rank}`;
  const rankTone = isLeader
    ? "text-[var(--v2-gold)]"
    : "text-[var(--v2-text-dim)]";
  const initialChar = (initial ?? name.charAt(0) ?? "?").toUpperCase();

  const body = (
    <>
      <span
        className={`w-5 text-right ${rankTone}`}
        style={{
          fontFamily: "var(--font-fraunces), Georgia, serif",
          fontSize: "15px",
          fontWeight: 500,
          lineHeight: 1,
        }}
      >
        {rankLabel}
      </span>
      <V2Avatar
        initial={initialChar}
        tone={tone}
        leader={isLeader}
        size={34}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className="truncate text-[14px] font-medium text-[var(--v2-text)]"
            style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
          >
            {name}
          </span>
          {isYou && (
            <span
              className="rounded-full bg-[var(--v2-sage)]/25 px-1.5 py-0.5 text-[8.5px] font-semibold uppercase text-[var(--v2-sage)]"
              style={{
                fontFamily: "var(--font-outfit), system-ui, sans-serif",
                letterSpacing: "0.08em",
              }}
            >
              You
            </span>
          )}
        </div>
        {meta && (
          <div
            className="mt-0.5 truncate text-[10.5px] text-[var(--v2-text-dim)]"
            style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
          >
            {meta}
          </div>
        )}
      </div>
      <div className="w-11 text-right">
        <div
          className={`leading-none ${primaryColor}`}
          style={{
            fontFamily: "var(--font-fraunces), Georgia, serif",
            fontSize: "18px",
            fontWeight: 600,
          }}
        >
          {primaryValue}
        </div>
        <div
          className="mt-0.5 text-[8px] text-[var(--v2-text-faint)]"
          style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
        >
          {primaryLabel}
        </div>
      </div>
      {secondaryValue !== undefined && (
        <div className="w-8 text-right">
          <div
            className="leading-none text-[var(--v2-gold)]"
            style={{
              fontFamily: "var(--font-fraunces), Georgia, serif",
              fontSize: "18px",
              fontWeight: 600,
            }}
          >
            {secondaryValue}
          </div>
          <div
            className="mt-0.5 text-[8px] text-[var(--v2-text-faint)]"
            style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
          >
            {secondaryLabel}
          </div>
        </div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`w-full text-left ${rowClass}`}>
        {body}
      </button>
    );
  }
  return <div className={rowClass}>{body}</div>;
}
