"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

/**
 * v2 bottom nav — 5 items per spec §5.8.
 * Home / Rounds / Stats / Events / Profile.
 *
 * Recent rounds + new-round logging are reached from Home and from the
 * "Rounds" tab (which lands on the round list / live round if active).
 * Courses moved off the global nav and lives under the Rounds flow.
 *
 * Visual: fixed to bottom, near-black blurred surface, hairline gold top.
 * Icons stroke-2, 20px, gold when active / faint when idle.
 */
const navItems = [
  {
    key: "home",
    href: "/",
    label: "Home",
    icon: HomeIcon,
    match: (p: string) => p === "/",
  },
  {
    key: "rounds",
    href: "/rounds/new",
    label: "Rounds",
    icon: RoundsIcon,
    match: (p: string) =>
      p.startsWith("/rounds") || p === "/courses" || p.startsWith("/courses/"),
  },
  {
    key: "stats",
    href: "/stats",
    label: "Stats",
    icon: StatsIcon,
    match: (p: string) => p.startsWith("/stats"),
  },
  {
    key: "events",
    href: "/events",
    label: "Events",
    icon: EventsIcon,
    match: (p: string) => p.startsWith("/events"),
  },
  {
    key: "profile",
    href: "/profile",
    label: "Profile",
    icon: ProfileIcon,
    match: (p: string) => p.startsWith("/profile"),
  },
] as const;

export function V2BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (!user) return null;
  // The live scoring page has its own bottom dock; hide the global nav so it
  // doesn't stack over the Finish button.
  if (pathname.startsWith("/rounds/live/") && !pathname.endsWith("/new")) {
    return null;
  }

  return (
    <nav
      className="safe-area-bottom fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: "rgba(8, 13, 8, 0.96)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "0.5px solid rgba(212, 175, 55, 0.15)",
      }}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 py-2">
        {navItems.map((item) => {
          const isActive = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-colors ${
                isActive ? "text-[var(--v2-gold)]" : "text-[var(--v2-text-faint)]"
              } hover:text-[var(--v2-text)]`}
            >
              <Icon active={isActive} />
              <span
                className="text-[9.5px] font-medium"
                style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

type IconProps = { active: boolean };

function HomeIcon({ active }: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.25 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" />
    </svg>
  );
}

function RoundsIcon({ active }: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.25 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2v6" />
      <circle cx="12" cy="14" r="3" />
      <path d="M12 17v5" />
      <path d="M5 22h14" />
    </svg>
  );
}

function StatsIcon({ active }: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.25 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 20h18" />
      <path d="M6 20v-8" />
      <path d="M11 20V8" />
      <path d="M16 20v-5" />
      <path d="M21 20V4" />
    </svg>
  );
}

function EventsIcon({ active }: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.25 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9V4a2 2 0 012-2h8a2 2 0 012 2v5" />
      <path d="M5 9h14l-1 9a3 3 0 01-3 3H9a3 3 0 01-3-3L5 9z" />
      <path d="M9 13l2 2 4-4" />
    </svg>
  );
}

function ProfileIcon({ active }: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.25 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}
