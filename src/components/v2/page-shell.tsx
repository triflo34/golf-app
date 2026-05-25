import { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Optional full-bleed header (gradient, image, etc.) above the content. */
  header?: ReactNode;
  className?: string;
};

/** Dark page shell — wraps every v2 page so the dark bg covers the viewport. */
export function V2PageShell({ children, header, className = "" }: Props) {
  return (
    <div className={`min-h-screen bg-[var(--v2-bg)] text-[var(--v2-fg)] ${className}`}>
      {header}
      <div className="mx-auto max-w-lg px-4 py-6">{children}</div>
    </div>
  );
}
