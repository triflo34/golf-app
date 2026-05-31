import { ReactNode } from "react";

type Props = {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  /** Render as a static span instead of a button (for non-interactive chips). */
  as?: "button" | "span";
  className?: string;
};

/**
 * v2 filter chip. Two states per spec §5.2:
 *   - active   → gold-tinted bg + brighter gold border + gold text
 *   - inactive → transparent bg + hairline gold border + dim text
 *
 * Used in horizontal chip rows (season, scope, format, holes), and as
 * non-interactive tags via `as="span"`.
 */
export function V2Pill({
  children,
  active = false,
  onClick,
  as = "button",
  className = "",
}: Props) {
  const tone = active ? "v2-chip v2-chip-on" : "v2-chip v2-chip-off";

  if (as === "span") {
    return <span className={`${tone} ${className}`}>{children}</span>;
  }
  return (
    <button type="button" onClick={onClick} className={`${tone} ${className}`}>
      {children}
    </button>
  );
}
