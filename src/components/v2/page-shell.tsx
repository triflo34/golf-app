import { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Optional full-bleed header (banner, gradient, etc.) rendered above the
   *  inner padded content. Use for screens like Profile where the top is a
   *  full-width banner instead of a header strip. */
  header?: ReactNode;
  className?: string;
};

/**
 * Dark page shell — wraps every v2 screen. Renders the vertical near-black
 * gradient background (see globals.css `.v2-bg`) under the inner content,
 * and pads the bottom so the fixed nav doesn't clip the last card.
 *
 * Spec §4: padding 14px 16px 92px; max-w-lg keeps mobile-first sizing on
 * desktop too.
 */
export function V2PageShell({ children, header, className = "" }: Props) {
  return (
    <div className={`v2-bg text-[var(--v2-text)] ${className}`}>
      {header}
      <div
        className="mx-auto max-w-lg"
        style={{ padding: "14px 16px 92px" }}
      >
        {children}
      </div>
    </div>
  );
}
