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
 * Pill / chip used for filters (year strip in Highlights mockup) and toggles
 * (Edit profile, Try classic UI). Yellow border + fill when active.
 */
export function V2Pill({
  children,
  active = false,
  onClick,
  as = "button",
  className = "",
}: Props) {
  const base =
    "inline-flex items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors";
  const activeCls =
    "bg-[var(--v2-accent)] text-black";
  const idleCls =
    "border border-[var(--v2-border)] bg-[var(--v2-surface)] text-[var(--v2-muted)] hover:text-white";

  if (as === "span") {
    return (
      <span className={`${base} ${active ? activeCls : idleCls} ${className}`}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${active ? activeCls : idleCls} ${className}`}
    >
      {children}
    </button>
  );
}
