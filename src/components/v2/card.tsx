import { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

/** Dark surface card matching the v2 mockup — soft border, rounded, no shadow. */
export function V2Card({ children, className = "" }: Props) {
  return (
    <div
      className={`rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-4 ${className}`}
    >
      {children}
    </div>
  );
}
