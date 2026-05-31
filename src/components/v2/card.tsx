import { ReactNode } from "react";

type Variant = "default" | "gold" | "live";

type Props = {
  children: ReactNode;
  className?: string;
  /** "default" = translucent green wash w/ hairline gold border.
   *  "gold"    = gold-tinted gradient surface for event banners / feature cards.
   *  "live"    = brighter green gradient w/ corner gold glow, for the live-round hero. */
  variant?: Variant;
  /** When true, the card gets a subtle hover lift (border tightens to 0.25). */
  interactive?: boolean;
};

/**
 * Translucent v2 card. Spec §5 — never a solid panel. The base styling is in
 * globals.css `.v2-card` so this component is just a thin wrapper that picks a
 * variant and merges custom classes.
 *
 * Existing v2 callsites that pass `className="!p-0"` to disable padding for
 * inset content (e.g. leaderboard rows with their own padding) continue to
 * work — the `!` Tailwind important modifier still overrides the inline-card
 * padding.
 */
export function V2Card({
  children,
  className = "",
  variant = "default",
  interactive = false,
}: Props) {
  const variantClass =
    variant === "gold"
      ? "v2-card-gold"
      : variant === "live"
        ? "v2-card-live"
        : "v2-card";
  const hover = interactive ? "v2-card-hover" : "";
  return (
    <div className={`${variantClass} ${hover} ${className}`}>{children}</div>
  );
}
