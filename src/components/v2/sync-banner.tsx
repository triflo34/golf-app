import { ReactNode } from "react";

type Props = {
  /** "synced" = sage banner (default), "queued" = amber banner with sync action. */
  state?: "synced" | "queued";
  children: ReactNode;
  /** Right-side action button. Useful for "Sync Now" when offline mutations exist. */
  action?: ReactNode;
  className?: string;
};

/**
 * v2 sync banner — spec §5.9. Thin strip that confirms live-mode is online
 * and recent, or warns about queued mutations. Reuses the offline-queue
 * subsystem already in place.
 */
export function V2SyncBanner({
  state = "synced",
  children,
  action,
  className = "",
}: Props) {
  const cls =
    state === "queued" ? "v2-sync-banner v2-sync-banner-warn" : "v2-sync-banner";
  return (
    <div className={`${cls} ${className}`}>
      <CheckOrCloud queued={state === "queued"} />
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}

function CheckOrCloud({ queued }: { queued: boolean }) {
  if (queued) {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 16.5A4.5 4.5 0 0014 9a6 6 0 00-11.7 1.5A4 4 0 003 18h13a2 2 0 002-2z" />
        <line x1="12" y1="11" x2="12" y2="15" />
        <line x1="12" y1="18" x2="12" y2="18.01" />
      </svg>
    );
  }
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}
