"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { V2PageShell } from "@/components/v2/page-shell";
import { V2Card } from "@/components/v2/card";
import { V2SectionTitle } from "@/components/v2/section-title";
import { V2Avatar, toneForName } from "@/components/v2/avatar";
import { V2LivePill } from "@/components/v2/live-pill";
import { V2ScorePill, scorePillToneForVsPar } from "@/components/v2/score-pill";
import type { RoundListItem } from "@/app/api/rounds/list/route";
import type { ActiveLiveRound } from "@/app/api/rounds/live/active/route";

/**
 * v2 Home — spec §7.1.
 * Replaces the classic leaderboard-on-home with: greeting strip + live hero
 * (when a round is in progress) + 2×2 quick actions + activity feed.
 *
 * The full season leaderboard moves to the Stats tab. This screen is the
 * "what's happening right now" surface.
 */
export function V2Home() {
  const { user, loading: authLoading } = useAuth();
  const [recent, setRecent] = useState<RoundListItem[] | null>(null);
  const [liveRounds, setLiveRounds] = useState<ActiveLiveRound[]>([]);

  const loadRecent = useCallback(async () => {
    const res = await fetch(`/api/rounds/list?limit=6`, { cache: "no-store" });
    const data = await res.json();
    setRecent(data.rounds ?? []);
  }, []);

  const loadLiveRounds = useCallback(async () => {
    const res = await fetch(`/api/rounds/live/active`, { cache: "no-store" });
    if (!res.ok) {
      setLiveRounds([]);
      return;
    }
    const data = await res.json();
    setLiveRounds(data.rounds ?? []);
  }, []);

  useEffect(() => {
    if (user) {
      loadRecent();
      loadLiveRounds();
    }
  }, [user, loadRecent, loadLiveRounds]);

  if (authLoading || !user) {
    return (
      <V2PageShell>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="animate-pulse text-[var(--v2-gold)]">Loading…</div>
        </div>
      </V2PageShell>
    );
  }

  return (
    <V2PageShell>
      <GreetingStrip name={user.display_name} />

      {liveRounds.length > 0 && (
        <div className="mt-4 v2-reveal">
          {liveRounds.slice(0, 1).map((lr) => (
            <LiveHero key={lr.id} round={lr} />
          ))}
        </div>
      )}

      <div className="mt-5 v2-reveal" style={{ animationDelay: "0.02s" }}>
        <QuickActions />
      </div>

      <div className="mt-7 v2-reveal" style={{ animationDelay: "0.04s" }}>
        <V2SectionTitle right={<Link href="/stats">See all ›</Link>}>
          Activity
        </V2SectionTitle>
        {recent === null ? (
          <V2Card>
            <div className="py-4 text-center text-sm text-[var(--v2-text-dim)]">
              Loading…
            </div>
          </V2Card>
        ) : recent.length === 0 ? (
          <V2Card>
            <div className="py-4 text-center text-sm text-[var(--v2-text-dim)]">
              No activity yet. Log a round to get started.
            </div>
          </V2Card>
        ) : (
          <ul className="space-y-2">
            {recent.map((round) => (
              <ActivityRow key={round.id} round={round} />
            ))}
          </ul>
        )}
      </div>
    </V2PageShell>
  );
}

// ===========================================================================

function GreetingStrip({ name }: { name: string }) {
  const greeting = greetingFor(new Date().getHours());
  const initial = (name.charAt(0) ?? "?").toUpperCase();
  const tone = toneForName(name);
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <V2Avatar initial={initial} tone={tone} size={36} leader={tone === "gold"} />
        <div className="leading-tight">
          <div
            className="text-[10px] uppercase tracking-wider text-[var(--v2-text-dim)]"
            style={{
              fontFamily: "var(--font-outfit), system-ui, sans-serif",
              letterSpacing: "0.1em",
            }}
          >
            {greeting}
          </div>
          <div
            className="text-[15px] font-medium text-[var(--v2-text)]"
            style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
          >
            {name}
          </div>
        </div>
      </div>
      <Link
        href="/profile"
        aria-label="Profile"
        className="relative flex h-8 w-8 items-center justify-center rounded-full border border-[var(--v2-gold)]/30 bg-[var(--v2-gold)]/10 text-[var(--v2-gold)] hover:bg-[var(--v2-gold)]/20"
      >
        <BellIcon />
      </Link>
    </div>
  );
}

function LiveHero({ round }: { round: ActiveLiveRound }) {
  return (
    <Link
      href={`/rounds/live/${round.id}`}
      className="block"
    >
      <V2Card variant="live" className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div
              className="text-[10px] font-semibold uppercase text-[var(--v2-gold)]"
              style={{
                fontFamily: "var(--font-outfit), system-ui, sans-serif",
                letterSpacing: "0.1em",
              }}
            >
              Live now · {round.hole_count} holes
            </div>
            <h3
              className="mt-1 truncate text-[19px] leading-tight text-[var(--v2-text)]"
              style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
            >
              {round.course_name}
            </h3>
            <div
              className="mt-1 text-[11px] text-[var(--v2-text-dim)]"
              style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
            >
              {round.player_count} player{round.player_count === 1 ? "" : "s"} ·{" "}
              {round.i_am_in ? "you're in" : "tap to join"}
            </div>
          </div>
          <V2LivePill />
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-[var(--v2-gold)]/15 pt-3">
          <div className="flex items-center gap-2 text-[var(--v2-gold)]">
            <span style={{ fontSize: "14px" }}>♛</span>
            <span
              className="text-[12px] font-medium"
              style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
            >
              Open scorecard
            </span>
          </div>
          <span
            className="text-[var(--v2-gold)]"
            style={{ fontFamily: "var(--font-fraunces), Georgia, serif", fontSize: "18px" }}
          >
            →
          </span>
        </div>
      </V2Card>
    </Link>
  );
}

function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <QuickTile
        href="/rounds/live/new"
        icon={<PlayIcon />}
        title="Start live round"
        sub="Hole-by-hole scoring"
      />
      <QuickTile
        href="/rounds/new"
        icon={<CameraIcon />}
        title="Scan scorecard"
        sub="From a paper card"
      />
      <QuickTile
        href="/matches/build"
        icon={<BalanceIcon />}
        title="Fair match"
        sub="Even teams, handicap-aware"
      />
      <QuickTile
        href="/events"
        icon={<TrophyIcon />}
        title="Events"
        sub="Golfapalooza & more"
      />
    </div>
  );
}

function QuickTile({
  href,
  icon,
  title,
  sub,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <Link href={href} className="block">
      <V2Card interactive className="!p-3">
        <div className="flex items-start gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-[var(--v2-gold)]"
            style={{
              background: "rgba(212, 175, 55, 0.12)",
              border: "0.5px solid rgba(212, 175, 55, 0.25)",
            }}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <div
              className="truncate text-[13px] font-medium text-[var(--v2-text)]"
              style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
            >
              {title}
            </div>
            <div
              className="text-[10px] text-[var(--v2-text-dim)]"
              style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
            >
              {sub}
            </div>
          </div>
        </div>
      </V2Card>
    </Link>
  );
}

function ActivityRow({ round }: { round: RoundListItem }) {
  // Winner = the strict-lowest gross. Excluded rounds get a muted treatment.
  const lowest =
    round.scores.length > 0
      ? round.scores.reduce(
          (acc, s) => (s.gross_score < acc ? s.gross_score : acc),
          round.scores[0].gross_score,
        )
      : 0;
  const winners = round.scores.filter((s) => s.gross_score === lowest);
  const headline =
    round.scores.length === 0
      ? "Round logged"
      : winners.length === 1
        ? `${winners[0].name} won at ${round.course_name}`
        : `${round.scores.length} players · ${round.course_name}`;
  // Cheap "career-ish" tone: very low gross (≤72) → gold, otherwise green
  const headlineTone =
    lowest <= 72 ? "gold" : scorePillToneForVsPar(lowest - 72);

  return (
    <li>
      <Link href={`/rounds/${round.id}`} className="block">
        <V2Card interactive className="!p-3">
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[var(--v2-sage)]"
              style={{
                background: "rgba(151, 196, 89, 0.15)",
                border: "0.5px solid rgba(151, 196, 89, 0.3)",
              }}
            >
              <FlagIcon />
            </span>
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-[13px] font-medium text-[var(--v2-text)] flex items-center gap-1.5"
                style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
              >
                {headline}
                {round.excluded && (
                  <span
                    className="rounded bg-[var(--v2-amber-warn)]/20 px-1 py-0.5 text-[8.5px] font-semibold uppercase text-[var(--v2-amber-warn)]"
                    style={{ letterSpacing: "0.08em" }}
                  >
                    excluded
                  </span>
                )}
              </div>
              <div
                className="text-[10.5px] text-[var(--v2-text-dim)]"
                style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
              >
                {formatRelativeDate(round.played_at)} · {round.scores.length}{" "}
                player{round.scores.length === 1 ? "" : "s"}
              </div>
            </div>
            {round.scores.length > 0 && (
              <V2ScorePill tone={headlineTone}>{lowest}</V2ScorePill>
            )}
          </div>
        </V2Card>
      </Link>
    </li>
  );
}

// ===========================================================================

function greetingFor(hour: number): string {
  if (hour < 5) return "Late night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Late night";
}

function formatRelativeDate(ymd: string): string {
  const d = new Date(ymd + "T00:00:00");
  const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ===========================================================================
// Icons — 20px stroke-2 by default

function BellIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 003.4 0" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="6 4 20 12 6 20 6 4" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function BalanceIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v18" />
      <path d="M3 7l9-2 9 2" />
      <path d="M5 10l-2 6a4 4 0 008 0l-2-6" />
      <path d="M19 10l-2 6a4 4 0 008 0l-2-6" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9V3h12v6a6 6 0 01-12 0z" />
      <path d="M6 5H3v3a3 3 0 003 3" />
      <path d="M18 5h3v3a3 3 0 01-3 3" />
      <path d="M9 19h6" />
      <path d="M12 15v4" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 22V4l13 4-13 4" />
    </svg>
  );
}
