type Props = {
  /** Visible label. Defaults to "LIVE". */
  label?: string;
  className?: string;
};

/**
 * v2 live pill — spec §5.9. Red badge with pulsing dot, used on:
 *   - the home-screen live-round hero
 *   - the live-round mode header
 *   - the event banner when a round is in progress
 *
 * Animation lives in globals.css (`@keyframes v2-pulse`).
 */
export function V2LivePill({ label = "LIVE", className = "" }: Props) {
  return (
    <span
      className={`v2-live-pill ${className}`}
      style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
    >
      <span className="v2-live-dot" />
      {label}
    </span>
  );
}
