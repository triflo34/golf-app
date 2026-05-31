"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode } from "react";

type Props = {
  /** Centered serif title. */
  title: ReactNode;
  /** Optional second line, small dim uppercase (e.g. "LIVE · OCT 15"). */
  subtitle?: ReactNode;
  /** Right-side action (icon / button). Pass null to omit. */
  right?: ReactNode;
  /** Where the back chevron should link. Default = browser back. */
  backHref?: string;
  /** When true, the back chevron is omitted (e.g. tab landing pages). */
  noBack?: boolean;
};

/**
 * v2 page header — spec §5.1. Three-zone flex: back chevron (left), serif
 * title (center, gold), action icon (right). Sits flush above the content,
 * no card surface of its own.
 */
export function V2Header({
  title,
  subtitle,
  right,
  backHref,
  noBack = false,
}: Props) {
  const router = useRouter();
  return (
    <header className="flex items-center justify-between gap-2 py-1">
      <div className="w-9">
        {!noBack &&
          (backHref ? (
            <Link
              href={backHref}
              aria-label="Back"
              className="flex h-9 w-9 items-center justify-center text-[var(--v2-gold)] hover:text-[var(--v2-gold-bright)]"
            >
              <BackChevron />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Back"
              className="flex h-9 w-9 items-center justify-center text-[var(--v2-gold)] hover:text-[var(--v2-gold-bright)]"
            >
              <BackChevron />
            </button>
          ))}
      </div>
      <div className="flex flex-1 flex-col items-center">
        <h1
          className="text-[20px] font-medium leading-tight text-[var(--v2-gold)]"
          style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
        >
          {title}
        </h1>
        {subtitle && (
          <div
            className="mt-0.5 text-[10px] font-semibold uppercase text-[var(--v2-text-dim)]"
            style={{
              fontFamily: "var(--font-outfit), system-ui, sans-serif",
              letterSpacing: "0.085em",
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      <div className="w-9 flex justify-end">{right}</div>
    </header>
  );
}

function BackChevron() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
