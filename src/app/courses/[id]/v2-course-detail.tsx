"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { V2PageShell } from "@/components/v2/page-shell";
import { V2Card } from "@/components/v2/card";
import { V2StatTile } from "@/components/v2/stat-tile";
import { V2SectionTitle } from "@/components/v2/section-title";
import type { CourseDetail } from "@/app/api/courses/[id]/route";
import type { CourseSearchResult } from "@/app/api/courses/search/route";

export function V2CourseDetail() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<CourseDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    if (!params?.id) return;
    fetch(`/api/courses/${params.id}`, { cache: "no-store" })
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d) setData(d);
      });
  }, [params?.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (notFound) {
    return (
      <V2PageShell>
        <Link href="/courses" className="text-sm font-medium text-[var(--v2-accent)]">
          ← Courses
        </Link>
        <V2Card className="mt-4">
          <div className="py-8 text-center text-[var(--v2-muted)]">
            Course not found.
          </div>
        </V2Card>
      </V2PageShell>
    );
  }

  if (!data) {
    return (
      <V2PageShell>
        <div className="animate-pulse text-[var(--v2-accent)]">Loading…</div>
      </V2PageShell>
    );
  }

  const c = data.course;

  return (
    <V2PageShell>
      <Link href="/courses" className="text-sm font-medium text-[var(--v2-accent)]">
        ← Courses
      </Link>

      <V2Card className="mb-4 mt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="mb-1 text-2xl font-bold text-white">{c.name}</h1>
            <div className="text-sm text-[var(--v2-muted)]">
              {c.city}, {c.state}
            </div>
            {c.address && (
              <div className="mt-1 text-xs text-[var(--v2-muted)]">{c.address}</div>
            )}
          </div>
          <FavoriteToggle
            courseId={c.id}
            initialFavorite={data.is_favorite ?? false}
          />
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          <V2StatTile label="Par" value={c.par} tone="gold" />
          <V2StatTile label="Holes" value={c.holes} tone="white" />
          <V2StatTile label="Rating" value={c.course_rating ?? "—"} tone="green" />
          <V2StatTile label="Slope" value={c.slope_rating ?? "—"} tone="green" />
        </div>

        {c.phone && (
          <div className="mt-3 text-sm text-[var(--v2-muted)]">📞 {c.phone}</div>
        )}
      </V2Card>

      {c.external_id &&
        c.last_fetched_at &&
        daysAgo(c.last_fetched_at) >= 30 && (
          <V2Card className="mb-4 border-[var(--v2-warn-border)] bg-[var(--v2-warn-bg)]">
            <div className="font-semibold text-[var(--v2-warn-text)]">
              Course data may be out of date
            </div>
            <div className="text-xs text-[var(--v2-warn-text-strong)]">
              Last refreshed {daysAgo(c.last_fetched_at)} days ago.
              {user?.is_admin
                ? " Use the admin tools below to pull fresh data."
                : " Ask an admin to refresh from GolfCourseAPI."}
            </div>
          </V2Card>
        )}

      {data.holes && data.holes.length > 0 && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold text-[var(--v2-accent)]">
              Scorecard
            </h2>
            {user?.is_admin && (
              <Link
                href={`/courses/${c.id}/edit-holes`}
                className="rounded-full border border-[var(--v2-warn-border)] px-2 py-1 text-xs font-medium text-[var(--v2-warn-text)] hover:bg-[var(--v2-warn-bg)]"
              >
                Edit holes
              </Link>
            )}
          </div>
          <V2Card className="mb-4">
            <CourseScorecard holes={data.holes} />
          </V2Card>
        </>
      )}

      <Link
        href={`/courses/${c.id}/strategy`}
        className="mb-4 block rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-4 py-3 text-center text-sm font-medium text-[var(--v2-text)] hover:border-[var(--v2-gold)]/30"
      >
        🗺 Hole strategy map →
      </Link>

      <V2SectionTitle>
        Top Scores ({data.rounds_played} rounds played here)
      </V2SectionTitle>
      <V2Card>
        {data.top_scores.length === 0 ? (
          <div className="py-6 text-center text-sm text-[var(--v2-muted)]">
            No rounds logged at this course yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {data.top_scores.map((s, i) => (
              <div
                key={`${i}-${s.played_at}-${s.gross_score}`}
                className="flex items-center justify-between rounded-lg bg-[var(--v2-surface-2)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 truncate text-sm font-semibold text-white">
                    {s.name}
                    {s.is_guest && (
                      <span className="rounded bg-[var(--v2-accent)]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--v2-accent)]">
                        guest
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--v2-muted)]">
                    {formatDate(s.played_at)}
                  </div>
                </div>
                <div className="ml-2 text-xl font-bold text-[var(--v2-score)]">
                  {s.gross_score}
                </div>
              </div>
            ))}
          </div>
        )}
      </V2Card>

      {user?.is_admin && (
        <div className="mt-4">
          <V2SectionTitle>Admin tools</V2SectionTitle>
          <div className="mt-2 space-y-3">
            <V2AdminRenamePanel
              courseId={c.id}
              initialName={c.name}
              initialCity={c.city}
              initialState={c.state}
              onChanged={load}
            />
            <V2AdminApiPanel
              courseId={c.id}
              externalId={c.external_id ?? null}
              lastFetchedAt={c.last_fetched_at ?? null}
              courseName={c.name}
              onChanged={load}
            />
            <Link
              href={`/courses/${c.id}/edit-holes`}
              className="block rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-4 py-3 text-center text-sm font-medium text-[var(--v2-text)] hover:border-[var(--v2-gold)]/30"
            >
              Edit per-hole pars / yardages →
            </Link>
          </div>
        </div>
      )}
    </V2PageShell>
  );
}

const v2Input =
  "w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-sm text-[var(--v2-text)] placeholder-[var(--v2-text-dim)]";

function V2AdminRenamePanel({
  courseId,
  initialName,
  initialCity,
  initialState,
  onChanged,
}: {
  courseId: number;
  initialName: string;
  initialCity: string;
  initialState: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [city, setCity] = useState(initialCity);
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(initialName);
    setCity(initialCity);
    setState(initialState);
  }, [initialName, initialCity, initialState]);

  const dirty =
    name.trim() !== initialName ||
    city.trim() !== initialCity ||
    state.trim() !== initialState;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}/rename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), city: city.trim(), state: state.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      onChanged();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <V2Card className="flex items-center justify-between">
        <span className="text-xs text-[var(--v2-text-dim)]">Course basics</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-1 text-xs font-medium text-[var(--v2-gold)]"
        >
          Rename / edit
        </button>
      </V2Card>
    );
  }

  return (
    <V2Card>
      <h2 className="mb-3 text-sm font-semibold text-[var(--v2-text)]">Rename / edit course basics</h2>
      <div className="space-y-2">
        <div>
          <label className="mb-1 block text-xs text-[var(--v2-text-dim)]">Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={v2Input} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="mb-1 block text-xs text-[var(--v2-text-dim)]">City</label>
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className={v2Input} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--v2-text-dim)]">State</label>
            <input type="text" value={state} onChange={(e) => setState(e.target.value)} className={v2Input} />
          </div>
        </div>
      </div>
      {error && (
        <div className="mt-2 rounded border border-[var(--v2-danger-border)] bg-[var(--v2-danger-bg)] px-2 py-1 text-xs text-[var(--v2-red-text)]">
          {error}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setName(initialName);
            setCity(initialCity);
            setState(initialState);
            setError(null);
          }}
          disabled={busy}
          className="flex-1 rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface)] py-2 text-sm font-medium text-[var(--v2-text)] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="flex-1 rounded-lg bg-[var(--v2-gold)] py-2 text-sm font-semibold text-[var(--v2-green-deep)] disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-[var(--v2-text-dim)]">
        Renaming doesn&rsquo;t affect existing rounds or scorecards — they reference this course by id.
      </p>
    </V2Card>
  );
}

function V2AdminApiPanel({
  courseId,
  externalId,
  lastFetchedAt,
  courseName,
  onChanged,
}: {
  courseId: number;
  externalId: string | null;
  lastFetchedAt: string | null;
  courseName: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLink, setShowLink] = useState(false);

  async function refresh() {
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}/refresh`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Refresh failed");
      setStatus(`Refreshed — ${body.holes ?? "?"} holes loaded.`);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "rounded-lg border border-[var(--v2-gold)]/35 bg-[var(--v2-gold)]/10 px-3 py-1.5 text-xs font-medium text-[var(--v2-gold)] disabled:opacity-50";

  return (
    <V2Card variant="gold">
      <h2 className="mb-1 text-sm font-semibold text-[var(--v2-gold)]">GolfCourseAPI link</h2>
      {externalId ? (
        <>
          <p className="text-xs text-[var(--v2-text-dim)]">
            Linked to <code className="font-mono text-[var(--v2-text)]">{externalId}</code>
            {lastFetchedAt && <> · last refreshed {new Date(lastFetchedAt).toLocaleString()}</>}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={refresh} disabled={busy} className={btn}>
              {busy ? "Refreshing…" : "Refresh per-hole pars"}
            </button>
            <button type="button" onClick={() => setShowLink((v) => !v)} disabled={busy} className={btn}>
              {showLink ? "Cancel re-link" : "Re-link to different API course"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-[var(--v2-text-dim)]">
            This course was created manually — per-hole pars likely default to 4. Search the
            GolfCourseAPI to attach real per-hole data.
          </p>
          <button
            type="button"
            onClick={() => setShowLink(true)}
            disabled={busy || showLink}
            className={`mt-2 ${btn}`}
          >
            Re-link to GolfCourseAPI
          </button>
        </>
      )}

      {status && (
        <div className="mt-2 rounded border border-[var(--v2-sage)]/40 bg-[var(--v2-sage)]/12 px-2 py-1 text-xs text-[var(--v2-sage)]">
          {status}
        </div>
      )}
      {error && (
        <div className="mt-2 rounded border border-[var(--v2-danger-border)] bg-[var(--v2-danger-bg)] px-2 py-1 text-xs text-[var(--v2-red-text)]">
          {error}
        </div>
      )}

      {showLink && (
        <V2RelinkSearch
          courseId={courseId}
          defaultQuery={courseName}
          onCancel={() => setShowLink(false)}
          onLinked={(holes) => {
            setShowLink(false);
            setStatus(`Linked — ${holes} holes loaded.`);
            setError(null);
            onChanged();
          }}
          onError={(msg) => setError(msg)}
        />
      )}
    </V2Card>
  );
}

function V2RelinkSearch({
  courseId,
  defaultQuery,
  onCancel,
  onLinked,
  onError,
}: {
  courseId: number;
  defaultQuery: string;
  onCancel: () => void;
  onLinked: (holes: number) => void;
  onError: (msg: string) => void;
}) {
  const [query, setQuery] = useState(defaultQuery);
  const [results, setResults] = useState<CourseSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      const seq = ++seqRef.current;
      setSearching(true);
      try {
        const res = await fetch(`/api/courses/search?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (seq !== seqRef.current) return;
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        const hits: CourseSearchResult[] = (data.results ?? []).filter(
          (r: CourseSearchResult) => r.source === "external",
        );
        setResults(hits);
      } catch (e) {
        if (seq !== seqRef.current) return;
        onError(e instanceof Error ? e.message : "Search failed");
        setResults([]);
      } finally {
        if (seq === seqRef.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [query, onError]);

  async function link(externalId: string) {
    setLinkingId(externalId);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ external_id: externalId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Link failed");
      onLinked(body.holes ?? 0);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Link failed");
    } finally {
      setLinkingId(null);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search GolfCourseAPI…"
        className={v2Input}
      />
      {searching && <div className="text-xs text-[var(--v2-text-dim)]">Searching…</div>}
      {!searching && query.trim().length >= 2 && results.length === 0 && (
        <div className="text-xs text-[var(--v2-text-dim)]">No API matches.</div>
      )}
      {results.length > 0 && (
        <ul className="max-h-64 divide-y divide-[var(--v2-border)] overflow-y-auto rounded-md border border-[var(--v2-border)] bg-[var(--v2-surface-2)]">
          {results.map((r) => {
            if (r.source !== "external") return null;
            const busy = linkingId === r.external_id;
            return (
              <li key={r.external_id}>
                <button
                  type="button"
                  disabled={Boolean(linkingId)}
                  onClick={() => link(r.external_id)}
                  className="w-full px-3 py-2 text-left hover:bg-[var(--v2-surface)] disabled:opacity-50"
                >
                  <div className="truncate text-sm font-medium text-[var(--v2-text)]">{r.name}</div>
                  <div className="truncate text-xs text-[var(--v2-text-dim)]">
                    {[r.city, r.state, r.country].filter(Boolean).join(", ") || "—"}
                    {" · "}
                    <code className="font-mono">{r.external_id}</code>
                  </div>
                  {busy && <div className="mt-0.5 text-[10px] text-[var(--v2-gold)]">Linking…</div>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" onClick={onCancel} className="text-xs text-[var(--v2-text-dim)] hover:text-[var(--v2-text)]">
        Cancel
      </button>
    </div>
  );
}

function CourseScorecard({
  holes,
}: {
  holes: {
    hole_number: number;
    par: number;
    handicap_index: number | null;
    yardage: number | null;
  }[];
}) {
  const front = holes.filter((h) => h.hole_number <= 9);
  const back = holes.filter((h) => h.hole_number > 9);
  const hasYardage = holes.some((h) => h.yardage != null);
  const hasHandicap = holes.some((h) => h.handicap_index != null);

  function nine(rows: typeof holes, label: string) {
    if (rows.length === 0) return null;
    const totalPar = rows.reduce((s, h) => s + h.par, 0);
    const totalYards = rows.reduce((s, h) => s + (h.yardage ?? 0), 0);
    return (
      <div className="-mx-1 overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="text-[var(--v2-muted)]">
              <th className="px-2 py-1 text-left font-medium">{label}</th>
              {rows.map((h) => (
                <th key={h.hole_number} className="px-2 py-1 font-medium">
                  {h.hole_number}
                </th>
              ))}
              <th className="px-2 py-1 font-medium text-white">Out</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-[var(--v2-border)]">
              <td className="px-2 py-1 text-[var(--v2-muted)]">Par</td>
              {rows.map((h) => (
                <td
                  key={h.hole_number}
                  className="px-2 py-1 text-center text-white"
                >
                  {h.par}
                </td>
              ))}
              <td className="px-2 py-1 text-center font-semibold text-[var(--v2-accent)]">
                {totalPar}
              </td>
            </tr>
            {hasYardage && (
              <tr className="border-t border-[var(--v2-border)]">
                <td className="px-2 py-1 text-[var(--v2-muted)]">Yds</td>
                {rows.map((h) => (
                  <td
                    key={h.hole_number}
                    className="px-2 py-1 text-center text-[var(--v2-fg)]"
                  >
                    {h.yardage ?? "—"}
                  </td>
                ))}
                <td className="px-2 py-1 text-center font-semibold text-[var(--v2-fg)]">
                  {totalYards || "—"}
                </td>
              </tr>
            )}
            {hasHandicap && (
              <tr className="border-t border-[var(--v2-border)]">
                <td className="px-2 py-1 text-[var(--v2-muted)]">HCP</td>
                {rows.map((h) => (
                  <td
                    key={h.hole_number}
                    className="px-2 py-1 text-center text-[var(--v2-muted)]"
                  >
                    {h.handicap_index ?? "—"}
                  </td>
                ))}
                <td className="px-2 py-1 text-center text-[var(--v2-muted)]">
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {nine(front, "Front")}
      {nine(back, "Back")}
    </div>
  );
}

function FavoriteToggle({
  courseId,
  initialFavorite,
}: {
  courseId: number;
  initialFavorite: boolean;
}) {
  const [fav, setFav] = useState(initialFavorite);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFav(initialFavorite);
  }, [initialFavorite]);

  async function toggle() {
    if (busy) return;
    const next = !fav;
    setFav(next);
    setBusy(true);
    try {
      const res = next
        ? await fetch(`/api/favorites`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ course_id: courseId }),
          })
        : await fetch(`/api/favorites?course_id=${courseId}`, {
            method: "DELETE",
          });
      if (!res.ok) throw new Error();
    } catch {
      setFav(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={fav}
      aria-label={fav ? "Unfavorite" : "Favorite"}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl transition ${
        fav
          ? "bg-[var(--v2-danger-bg)] text-[var(--v2-red-text)] hover:bg-[var(--v2-danger-bg)]"
          : "bg-[var(--v2-surface-2)] text-[var(--v2-muted)] hover:text-[var(--v2-red-text)]"
      } disabled:opacity-50`}
    >
      {fav ? "♥" : "♡"}
    </button>
  );
}

function formatDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function daysAgo(timestamp: string): number {
  const ms = Date.now() - new Date(timestamp).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}
