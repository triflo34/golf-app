"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { V2PageShell } from "@/components/v2/page-shell";
import { V2Card } from "@/components/v2/card";
import { V2SectionTitle } from "@/components/v2/section-title";
import type { Course, User } from "@/lib/types";
import {
  buildTwoTeamArrangements,
  type BuilderPlayer,
  type TeamArrangement,
} from "@/lib/match-builder";
import type { MatchFormat } from "@/lib/handicap";
import type { CourseHandicapsResponse } from "@/app/api/courses/[id]/handicaps/route";

type Variant = "classic" | "v2";

type Props = { variant: Variant };

const FORMATS: { value: MatchFormat; label: string; hint: string }[] = [
  { value: "scramble", label: "Scramble", hint: "Weighted team HC (25/20/15/10)" },
  { value: "best_ball", label: "Best ball", hint: "Average team HC" },
  { value: "individual", label: "Individual", hint: "Average team HC" },
];

export function MatchBuilder({ variant }: Props) {
  const v2 = variant === "v2";
  const { user, loading: authLoading } = useAuth();

  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [courseQuery, setCourseQuery] = useState("");
  const [showCoursePicker, setShowCoursePicker] = useState(false);

  const [holeCount, setHoleCount] = useState<9 | 18>(18);
  const [ninePlayed, setNinePlayed] = useState<"front" | "back">("front");
  const [format, setFormat] = useState<MatchFormat>("scramble");

  const [users, setUsers] = useState<User[]>([]);
  type Entry =
    | { kind: "user"; userId: string }
    | { kind: "guest"; name: string; courseHandicap: number };
  const [entries, setEntries] = useState<Entry[]>([]);
  const [playerQuery, setPlayerQuery] = useState("");
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestHc, setGuestHc] = useState("");
  const [guestError, setGuestError] = useState("");

  const [aSize, setASize] = useState<number | null>(null);
  const [handicaps, setHandicaps] = useState<
    CourseHandicapsResponse["by_user_id"] | null
  >(null);
  const [loadingHc, setLoadingHc] = useState(false);
  const [error, setError] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    fetch("/api/courses")
      .then((r) => r.json())
      .then((d) => setCourses(d.courses ?? []));
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []));
  }, []);

  useEffect(() => {
    if (!user) return;
    setEntries((arr) =>
      arr.some((e) => e.kind === "user" && e.userId === user.id)
        ? arr
        : [{ kind: "user", userId: user.id }, ...arr],
    );
  }, [user]);

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === courseId) ?? null,
    [courses, courseId],
  );

  const filteredCourses = useMemo(() => {
    const q = courseQuery.trim().toLowerCase();
    if (!q) return courses.slice(0, 30);
    return courses
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [courses, courseQuery]);

  const takenUserIds = useMemo(
    () =>
      new Set(
        entries.filter((e) => e.kind === "user").map((e) => (e as { userId: string }).userId),
      ),
    [entries],
  );
  const takenGuestNames = useMemo(
    () =>
      new Set(
        entries
          .filter((e) => e.kind === "guest")
          .map((e) => (e as { name: string }).name.toLowerCase()),
      ),
    [entries],
  );

  const filteredUsers = useMemo(() => {
    const q = playerQuery.trim().toLowerCase();
    return users
      .filter((u) => !takenUserIds.has(u.id))
      .filter(
        (u) =>
          !q ||
          u.display_name.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [users, playerQuery, takenUserIds]);

  const n = entries.length;

  useEffect(() => {
    if (n < 2) {
      setASize(null);
    } else if (aSize == null || aSize < 1 || aSize >= n) {
      setASize(Math.floor(n / 2));
    }
  }, [n, aSize]);

  function addGuest() {
    setGuestError("");
    const name = guestName.trim();
    const hc = Number(guestHc);
    if (!name) {
      setGuestError("Name required");
      return;
    }
    if (takenGuestNames.has(name.toLowerCase())) {
      setGuestError("Guest already added");
      return;
    }
    if (!Number.isFinite(hc) || hc < -10 || hc > 54) {
      setGuestError("Course HC must be between −10 and 54");
      return;
    }
    if (n >= 8) {
      setGuestError("Max 8 players");
      return;
    }
    setEntries((arr) => [...arr, { kind: "guest", name, courseHandicap: hc }]);
    setHandicaps(null);
    setGuestName("");
    setGuestHc("");
  }

  async function loadHandicaps() {
    setError("");
    setHandicaps(null);
    if (!courseId) {
      setError("Pick a course");
      return;
    }
    if (n < 2) {
      setError("Add at least 2 players");
      return;
    }
    const userIds = entries
      .filter((e) => e.kind === "user")
      .map((e) => (e as { userId: string }).userId);
    if (userIds.length === 0) {
      // No registered users — guests only, no API call needed.
      setHandicaps({});
      return;
    }
    setLoadingHc(true);
    const ninePart = holeCount === 9 ? `&nine_played=${ninePlayed}` : "";
    const url = `/api/courses/${courseId}/handicaps?user_ids=${encodeURIComponent(
      userIds.join(","),
    )}&hole_count=${holeCount}${ninePart}`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const data = (await res.json()) as CourseHandicapsResponse;
      if (!res.ok) throw new Error("Failed to load handicaps");
      setHandicaps(data.by_user_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load handicaps");
    } finally {
      setLoadingHc(false);
    }
  }

  type ResolvedPlayer = BuilderPlayer & { is_guest: boolean };

  const resolvedPlayers: ResolvedPlayer[] | null = useMemo(() => {
    if (!handicaps) return null;
    const out: ResolvedPlayer[] = [];
    for (const e of entries) {
      if (e.kind === "user") {
        const u = users.find((x) => x.id === e.userId);
        if (!u) return null;
        const hc = handicaps[e.userId]?.course_handicap;
        if (hc == null) return null;
        out.push({
          key: `u:${e.userId}`,
          name: u.display_name,
          course_handicap: hc,
          is_guest: false,
        });
      } else {
        out.push({
          key: `g:${e.name.toLowerCase()}`,
          name: e.name,
          course_handicap: e.courseHandicap,
          is_guest: true,
        });
      }
    }
    return out;
  }, [handicaps, entries, users]);

  const arrangements: TeamArrangement[] = useMemo(() => {
    if (!resolvedPlayers || aSize == null) return [];
    return buildTwoTeamArrangements(resolvedPlayers, format, aSize, 5);
  }, [resolvedPlayers, aSize, format]);

  const missingHc =
    handicaps &&
    entries
      .filter((e) => e.kind === "user")
      .map((e) => users.find((u) => u.id === (e as { userId: string }).userId))
      .filter((u): u is User => !!u)
      .filter((u) => handicaps[u.id]?.course_handicap == null);

  const cls = {
    title: v2
      ? "mb-4 text-2xl font-bold text-[var(--v2-accent)]"
      : "mb-4 text-2xl font-bold text-green-800",
    card: v2
      ? "mb-4 rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-4"
      : "card mb-4",
    label: v2
      ? "mb-1 block text-sm font-medium text-[var(--v2-muted)]"
      : "mb-1 block text-sm font-medium text-gray-700",
    input: v2
      ? "w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-white placeholder-[var(--v2-muted)] focus:border-[var(--v2-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--v2-accent)]/40"
      : "w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900",
    selectedBox: v2
      ? "flex items-center justify-between rounded-lg bg-[var(--v2-surface-2)] px-3 py-2"
      : "flex items-center justify-between bg-green-50 rounded-lg px-3 py-2",
    selectedName: v2 ? "font-semibold text-white" : "font-semibold text-gray-800",
    changeBtn: v2
      ? "text-sm font-medium text-[var(--v2-accent)]"
      : "text-sm text-green-700 font-medium",
    dropdown: v2
      ? "mt-2 max-h-60 overflow-y-auto rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)]"
      : "mt-2 max-h-60 overflow-y-auto border border-gray-200 rounded-lg",
    dropdownRow: v2
      ? "w-full px-3 py-2 text-left hover:bg-[var(--v2-surface)] border-b border-[var(--v2-border)] last:border-b-0"
      : "w-full text-left px-3 py-2 hover:bg-green-50 border-b border-gray-100 last:border-b-0",
    rowName: v2 ? "text-sm font-semibold text-white" : "text-sm font-semibold text-gray-800",
    rowMeta: v2 ? "text-xs text-[var(--v2-muted)]" : "text-xs text-gray-500",
    chipActive: v2
      ? "px-3 py-1.5 text-sm font-medium bg-[var(--v2-accent)] text-black rounded-full"
      : "px-3 py-1.5 text-sm font-medium bg-green-700 text-white rounded-full",
    chipIdle: v2
      ? "px-3 py-1.5 text-sm font-medium bg-[var(--v2-surface-2)] text-[var(--v2-muted)] hover:bg-[var(--v2-border)] rounded-full"
      : "px-3 py-1.5 text-sm font-medium bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 rounded-full",
    submit: v2
      ? "w-full rounded-lg bg-[var(--v2-accent)] py-3 text-sm font-semibold text-black hover:bg-[var(--v2-accent-soft)] disabled:opacity-50"
      : "w-full py-3 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 disabled:opacity-50",
    errorBox: v2
      ? "rounded-lg bg-red-950/60 p-3 text-sm text-red-300"
      : "bg-red-50 text-red-600 text-sm p-3 rounded-lg",
    bg: v2 ? "" : "max-w-lg mx-auto px-4 py-6",
    teamLabel: v2 ? "text-xs uppercase tracking-wide text-[var(--v2-muted)]" : "text-xs uppercase tracking-wide text-gray-500",
    teamHc: v2 ? "text-2xl font-bold text-[var(--v2-accent)]" : "text-2xl font-bold text-green-700",
    playerChip: v2
      ? "inline-block rounded-full bg-[var(--v2-surface-2)] px-2 py-0.5 text-xs text-white"
      : "inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700",
    fairBadge: v2
      ? "inline-block rounded-full bg-[var(--v2-score)]/20 px-2 py-0.5 text-xs font-semibold text-[var(--v2-score-soft)]"
      : "inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700",
  };

  if (authLoading || !user) {
    if (v2) {
      return (
        <V2PageShell>
          <div className="flex h-[60vh] items-center justify-center">
            <div className="animate-pulse text-[var(--v2-accent)]">Loading…</div>
          </div>
        </V2PageShell>
      );
    }
    return <div className={cls.bg}>Loading…</div>;
  }

  const inner = (
    <>
      <h1 className={cls.title}>Build a Fair Match</h1>

      {/* Help / key */}
      <div className={cls.card}>
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className={`flex w-full items-center justify-between ${cls.rowName}`}
        >
          <span>How to read this page</span>
          <span className={cls.rowMeta}>{showHelp ? "−" : "+"}</span>
        </button>
        {showHelp && (
          <div className="mt-3 space-y-3 border-t border-[var(--v2-border)] pt-3">
            <div>
              <div className={cls.teamLabel}>1. Pick a course + holes</div>
              <div className={cls.rowMeta}>
                Course handicaps depend on the course&apos;s rating and slope,
                so we have to know where you&apos;re playing. Front/Back matters
                for 9-hole matches.
              </div>
            </div>
            <div>
              <div className={cls.teamLabel}>2. Add players</div>
              <div className={cls.rowMeta}>
                Pick registered players from the search, or add a guest with
                an estimated course HC (their stroke count at this course).
                You&apos;re added by default; tap × to remove anyone.
              </div>
            </div>
            <div>
              <div className={cls.teamLabel}>3. Pick a format</div>
              <div className={cls.rowMeta}>
                <strong>Scramble:</strong> team HC uses USGA-recommended
                weights: 2-player 35/15, 3-player 30/20/10, 4-player 25/20/15/10
                (lowest HC gets the biggest share).{" "}
                <strong>Best ball / Individual:</strong> team HC is the simple
                average of player HCs.
              </div>
            </div>
            <div>
              <div className={cls.teamLabel}>4. Pick team sizes</div>
              <div className={cls.rowMeta}>
                &ldquo;3 v 2&rdquo; means one team has 3 players, the other 2.
                Defaults to the most balanced split.
              </div>
            </div>
            <div>
              <div className={cls.teamLabel}>5. Read the suggestions</div>
              <div className={cls.rowMeta}>
                Each card shows two teams with their team HC underneath the
                label. The{" "}
                <span className={cls.fairBadge}>Δ</span> badge is the
                fairness gap (team HC difference) — lower is closer to a fair
                fight. Player chips show each person&apos;s course HC in
                parentheses. We sort top 5 by lowest Δ.
              </div>
            </div>
            <div className={cls.rowMeta}>
              No handicap? You need 3+ eligible rounds first. If a player has
              no index, no suggestions will render.
            </div>
          </div>
        )}
      </div>

      {/* Course */}
      <div className={cls.card}>
        <label className={cls.label}>Course</label>
        {selectedCourse ? (
          <div className={cls.selectedBox}>
            <div>
              <div className={cls.selectedName}>{selectedCourse.name}</div>
              <div className={cls.rowMeta}>
                {selectedCourse.city}
                {selectedCourse.course_rating && selectedCourse.slope_rating
                  ? ` · ${selectedCourse.course_rating}/${selectedCourse.slope_rating}`
                  : " · no rating"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setCourseId(null);
                setShowCoursePicker(true);
                setHandicaps(null);
              }}
              className={cls.changeBtn}
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={courseQuery}
              onFocus={() => setShowCoursePicker(true)}
              onChange={(e) => {
                setCourseQuery(e.target.value);
                setShowCoursePicker(true);
              }}
              placeholder="Search courses…"
              className={cls.input}
            />
            {showCoursePicker && (
              <div className={cls.dropdown}>
                {filteredCourses.length === 0 ? (
                  <div className={`${cls.dropdownRow} cursor-default`}>
                    <span className={cls.rowMeta}>No courses</span>
                  </div>
                ) : (
                  filteredCourses.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCourseId(c.id);
                        setCourseQuery("");
                        setShowCoursePicker(false);
                        setHandicaps(null);
                      }}
                      className={cls.dropdownRow}
                    >
                      <div className={cls.rowName}>{c.name}</div>
                      <div className={cls.rowMeta}>
                        {c.city}
                        {c.course_rating && c.slope_rating
                          ? ` · ${c.course_rating}/${c.slope_rating}`
                          : " · no rating"}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Hole count + nine */}
      <div className={cls.card}>
        <label className={cls.label}>Holes</label>
        <div className="flex flex-wrap gap-2">
          {[18, 9].map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => {
                setHoleCount(h as 9 | 18);
                setHandicaps(null);
              }}
              className={holeCount === h ? cls.chipActive : cls.chipIdle}
            >
              {h} holes
            </button>
          ))}
        </div>
        {holeCount === 9 && (
          <div className="mt-3">
            <label className={cls.label}>Nine</label>
            <div className="flex gap-2">
              {(["front", "back"] as const).map((nine) => (
                <button
                  key={nine}
                  type="button"
                  onClick={() => {
                    setNinePlayed(nine);
                    setHandicaps(null);
                  }}
                  className={ninePlayed === nine ? cls.chipActive : cls.chipIdle}
                >
                  {nine === "front" ? "Front 9" : "Back 9"}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Players */}
      <div className={cls.card}>
        <label className={cls.label}>Players ({n}/8)</label>
        <div className="mb-2 flex flex-wrap gap-2">
          {entries.map((e, idx) => {
            const name =
              e.kind === "user"
                ? users.find((u) => u.id === e.userId)?.display_name ?? "…"
                : e.name;
            const guestHcLabel =
              e.kind === "guest" ? ` · HC ${e.courseHandicap}` : "";
            return (
              <span
                key={e.kind === "user" ? `u:${e.userId}` : `g:${e.name}:${idx}`}
                className={`${cls.selectedBox} !inline-flex !gap-2 !py-1`}
              >
                <span className={cls.selectedName}>
                  {name}
                  {e.kind === "guest" && (
                    <span className={`ml-1 ${cls.fairBadge}`}>guest</span>
                  )}
                  {guestHcLabel && (
                    <span className={`ml-1 ${cls.rowMeta}`}>
                      {guestHcLabel}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEntries((arr) => arr.filter((_, i) => i !== idx));
                    setHandicaps(null);
                  }}
                  className={cls.changeBtn}
                  aria-label={`Remove ${name}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
        {n < 8 && (
          <>
            <input
              type="text"
              value={playerQuery}
              onFocus={() => setShowPlayerPicker(true)}
              onChange={(e) => {
                setPlayerQuery(e.target.value);
                setShowPlayerPicker(true);
              }}
              placeholder="Add a registered player…"
              className={cls.input}
            />
            {showPlayerPicker && (
              <div className={cls.dropdown}>
                {filteredUsers.length === 0 ? (
                  <div className={`${cls.dropdownRow} cursor-default`}>
                    <span className={cls.rowMeta}>No matches</span>
                  </div>
                ) : (
                  filteredUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setEntries((arr) => [
                          ...arr,
                          { kind: "user", userId: u.id },
                        ]);
                        setPlayerQuery("");
                        setShowPlayerPicker(false);
                        setHandicaps(null);
                      }}
                      className={cls.dropdownRow}
                    >
                      <div className={cls.rowName}>{u.display_name}</div>
                      <div className={cls.rowMeta}>@{u.username}</div>
                    </button>
                  ))
                )}
              </div>
            )}

            <div className={`mt-3 border-t ${v2 ? "border-[var(--v2-border)]" : "border-gray-200"} pt-3`}>
              <div className={`${cls.label} !mb-2`}>
                Or add a guest with an estimated HC
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Guest name"
                  className={`${cls.input} flex-1`}
                />
                <input
                  type="number"
                  value={guestHc}
                  onChange={(e) => setGuestHc(e.target.value)}
                  placeholder="HC"
                  inputMode="numeric"
                  className={`${cls.input} w-20`}
                />
                <button
                  type="button"
                  onClick={addGuest}
                  className={cls.chipActive}
                >
                  Add
                </button>
              </div>
              {guestError && (
                <div className={`${cls.rowMeta} mt-1 text-orange-500`}>
                  {guestError}
                </div>
              )}
              <div className={`${cls.rowMeta} mt-1`}>
                Estimate the guest&apos;s course handicap (their strokes
                received at this course). Used directly in team math.
              </div>
            </div>
          </>
        )}
      </div>

      {/* Format */}
      <div className={cls.card}>
        <label className={cls.label}>Format</label>
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFormat(f.value)}
              className={format === f.value ? cls.chipActive : cls.chipIdle}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className={`${cls.rowMeta} mt-2`}>
          {FORMATS.find((f) => f.value === format)?.hint}
        </div>
      </div>

      {/* Team A size */}
      {n >= 2 && (
        <div className={cls.card}>
          <label className={cls.label}>Team sizes</label>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: n - 1 }, (_, i) => i + 1).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setASize(s)}
                className={aSize === s ? cls.chipActive : cls.chipIdle}
              >
                {s} v {n - s}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <div className={`${cls.errorBox} mb-4`}>{error}</div>}

      <button
        type="button"
        onClick={loadHandicaps}
        disabled={loadingHc || !courseId || n < 2}
        className={cls.submit}
      >
        {loadingHc ? "Calculating…" : "Suggest fair teams"}
      </button>

      {/* Results */}
      {handicaps && missingHc && missingHc.length > 0 && (
        <div className={`${cls.errorBox} mt-4`}>
          Missing handicap for: {missingHc.map((u) => u.display_name).join(", ")}.
          {" "}
          {v2 ? (
            <span>Need 3+ rated rounds to compute an index.</span>
          ) : (
            <span>Need 3+ rated rounds to compute an index.</span>
          )}
        </div>
      )}

      {arrangements.length > 0 && (
        <div className="mt-6">
          <V2SectionTitle>Top suggestions</V2SectionTitle>
          <div className="mt-2 space-y-3">
            {arrangements.map((arr, i) => (
              <V2Card key={i}>
                <div className="mb-2 flex items-center justify-between">
                  <span className={cls.rowMeta}>
                    Option {i + 1}
                  </span>
                  <span className={cls.fairBadge}>
                    Δ {arr.fairness_delta}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {arr.teams.map((team, ti) => (
                    <div key={ti}>
                      <div className={cls.teamLabel}>
                        Team {ti === 0 ? "A" : "B"}
                      </div>
                      <div className={cls.teamHc}>
                        {arr.team_handicaps[ti]}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {team.map((p) => {
                          const isGuest = p.key.startsWith("g:");
                          return (
                            <span key={p.key} className={cls.playerChip}>
                              {p.name}
                              {isGuest && (
                                <span className="ml-1 text-[10px] opacity-70">
                                  guest
                                </span>
                              )}
                              <span className="ml-1 opacity-60">
                                ({p.course_handicap})
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </V2Card>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <Link
          href="/rounds/new"
          className={`${cls.changeBtn} text-sm`}
        >
          ← Back to log a round
        </Link>
      </div>
    </>
  );

  if (v2) return <V2PageShell>{inner}</V2PageShell>;
  return <div className={cls.bg}>{inner}</div>;
}
