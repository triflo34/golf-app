import { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Optional trailing element (e.g. a "view all ›" link). */
  right?: ReactNode;
  className?: string;
};

/**
 * v2 section title. Per spec §3:
 *   - Fraunces serif, weight 600
 *   - 14px, UPPERCASE, letter-spacing 1.2px
 *   - gold tint, sits ~11px above its content
 */
export function V2SectionTitle({ children, right, className = "" }: Props) {
  return (
    <div className={`mb-3 flex items-baseline justify-between ${className}`}>
      <h2
        className="text-[14px] font-semibold uppercase text-[var(--v2-gold)]"
        style={{
          fontFamily: "var(--font-fraunces), Georgia, serif",
          letterSpacing: "0.085em",
        }}
      >
        {children}
      </h2>
      {right && (
        <div
          className="text-[11px] font-medium text-[var(--v2-text-dim)]"
          style={{
            fontFamily: "var(--font-outfit), system-ui, sans-serif",
          }}
        >
          {right}
        </div>
      )}
    </div>
  );
}
