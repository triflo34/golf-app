import { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Optional trailing element (e.g. a "view all >" link). */
  right?: ReactNode;
};

/** Gold section title used above Recent Rounds, Best Courses, etc. */
export function V2SectionTitle({ children, right }: Props) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-lg font-bold text-[var(--v2-accent)]">{children}</h2>
      {right && <div className="text-[var(--v2-accent)]">{right}</div>}
    </div>
  );
}
