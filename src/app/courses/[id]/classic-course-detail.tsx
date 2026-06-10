"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { CourseDetail } from "@/app/api/courses/[id]/route";
import type { CourseSearchResult } from "@/app/api/courses/search/route";
import { useAuth } from "@/components/auth-provider";

export function ClassicCourseDetail() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<CourseDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    if (!params?.id) return;
    fetch(`/api/courses/${params.id}`, { cache: "no-store" })
      .then(async (r) => {
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
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href="/courses" className="text-sm text-green-700 font-medium">
          ← Courses
        </Link>
        <div className="card mt-4 text-center py-10 text-gray-400">
          Course not found.
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="animate-pulse text-green-700">Loading...</div>
      </div>
    );
  }

  const c = data.course;

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <Link href="/courses" className="text-sm text-green-700 font-medium">
        ← Courses
      </Link>

      <div className="card mt-3 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-green-800 mb-1">{c.name}</h1>
            <div className="text-sm text-gray-500">{c.city}, {c.state}</div>
            {c.address && (
              <div className="text-xs text-gray-400 mt-1">{c.address}</div>
            )}
          </div>
          <FavoriteToggle
            courseId={c.id}
            initialFavorite={data.is_favorite ?? false}
          />
        </div>

        <div className="grid grid-cols-4 gap-2 mt-4 text-center">
          <Stat label="par" value={c.par} />
          <Stat label="holes" value={c.holes} />
          <Stat label="rating" value={c.course_rating ?? "—"} />
          <Stat label="slope" value={c.slope_rating ?? "—"} />
        </div>

        {c.phone && (
          <div className="text-sm text-gray-600 mt-3">📞 {c.phone}</div>
        )}
      </div>

      {c.external_id && c.last_fetched_at && isStale(c.last_fetched_at) && (
        <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          <div className="font-semibold text-amber-900">Course data may be out of date</div>
          <div>
            Last refreshed {daysAgo(c.last_fetched_at)} days ago.
            {user?.is_admin
              ? " Use the admin panel below to pull fresh data."
              : " Ask an admin to refresh from GolfCourseAPI."}
          </div>
        </div>
      )}

      {user?.is_admin && (
        <>
          <AdminRenamePanel
            courseId={c.id}
            initialName={c.name}
            initialCity={c.city}
            initialState={c.state}
            onChanged={load}
          />
          <AdminApiPanel
            courseId={c.id}
            externalId={c.external_id ?? null}
            lastFetchedAt={c.last_fetched_at ?? null}
            courseName={c.name}
            onChanged={load}
          />
        </>
      )}

      {data.holes && data.holes.length > 0 && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800 text-sm">Scorecard</h2>
            {user?.is_admin && (
              <Link
                href={`/courses/${c.id}/edit-holes`}
                className="text-xs font-medium text-amber-800 px-2 py-1 rounded bg-amber-50 border border-amber-200 hover:bg-amber-100"
              >
                Edit holes
              </Link>
            )}
          </div>
          <ScorecardTable holes={data.holes} />
        </div>
      )}

      <Link
        href={`/courses/${c.id}/strategy`}
        className="card mb-4 block text-center text-sm font-medium text-green-700 hover:bg-green-50"
      >
        🗺 Hole strategy map →
      </Link>

      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-3 text-sm">
          Top scores ({data.rounds_played} rounds played here)
        </h2>
        {data.top_scores.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">
            No rounds logged at this course yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {data.top_scores.map((s, i) => (
              <div
                key={`${i}-${s.played_at}-${s.gross_score}`}
                className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-gray-800 truncate flex items-center gap-1.5">
                    {s.name}
                    {s.is_guest && (
                      <span className="text-[10px] font-semibold text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">
                        guest
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDate(s.played_at)}
                  </div>
                </div>
                <div className="text-lg font-bold text-green-700 ml-2">
                  {s.gross_score}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ScorecardTable({
  holes,
}: {
  holes: { hole_number: number; par: number; handicap_index: number | null; yardage: number | null }[];
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
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="text-gray-500">
              <th className="px-2 py-1 text-left font-medium">{label}</th>
              {rows.map((h) => (
                <th key={h.hole_number} className="px-2 py-1 font-medium">
                  {h.hole_number}
                </th>
              ))}
              <th className="px-2 py-1 font-medium text-gray-700">Out</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-200">
              <td className="px-2 py-1 text-gray-500">Par</td>
              {rows.map((h) => (
                <td key={h.hole_number} className="px-2 py-1 text-center text-gray-900">
                  {h.par}
                </td>
              ))}
              <td className="px-2 py-1 text-center font-semibold text-gray-900">
                {totalPar}
              </td>
            </tr>
            {hasYardage && (
              <tr className="border-t border-gray-100">
                <td className="px-2 py-1 text-gray-500">Yds</td>
                {rows.map((h) => (
                  <td key={h.hole_number} className="px-2 py-1 text-center text-gray-700">
                    {h.yardage ?? "—"}
                  </td>
                ))}
                <td className="px-2 py-1 text-center font-semibold text-gray-700">
                  {totalYards || "—"}
                </td>
              </tr>
            )}
            {hasHandicap && (
              <tr className="border-t border-gray-100">
                <td className="px-2 py-1 text-gray-500">HCP</td>
                {rows.map((h) => (
                  <td key={h.hole_number} className="px-2 py-1 text-center text-gray-600">
                    {h.handicap_index ?? "—"}
                  </td>
                ))}
                <td className="px-2 py-1 text-center text-gray-400">—</td>
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

function AdminRenamePanel({
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
        body: JSON.stringify({
          name: name.trim(),
          city: city.trim(),
          state: state.trim(),
        }),
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
      <div className="card mb-4 border border-gray-200 bg-gray-50 flex items-center justify-between">
        <span className="text-xs text-gray-600">
          Admin · course basics
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-medium text-gray-700 px-3 py-1 rounded-lg bg-white border border-gray-200 hover:bg-gray-100"
        >
          Rename / edit
        </button>
      </div>
    );
  }

  return (
    <div className="card mb-4 border border-gray-300 bg-white">
      <h2 className="font-semibold text-gray-800 text-sm mb-3">
        Rename / edit course basics
      </h2>
      <div className="space-y-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">State</label>
            <input
              type="text"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm"
            />
          </div>
        </div>
      </div>
      {error && (
        <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded">
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
          className="flex-1 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="flex-1 py-2 bg-green-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        Renaming doesn&rsquo;t affect existing rounds or scorecards — they
        reference this course by id.
      </p>
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
    setFav(next); // optimistic
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
      setFav(!next); // revert
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
      className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xl transition ${
        fav
          ? "bg-red-50 text-red-600 hover:bg-red-100"
          : "bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      } disabled:opacity-50`}
    >
      {fav ? "♥" : "♡"}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-lg font-bold text-green-700">{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function formatDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

const STALE_DAYS = 30;

function daysAgo(timestamp: string): number {
  const ms = Date.now() - new Date(timestamp).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function isStale(timestamp: string): boolean {
  return daysAgo(timestamp) >= STALE_DAYS;
}

function AdminApiPanel({
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
      const res = await fetch(`/api/courses/${courseId}/refresh`, {
        method: "POST",
      });
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

  return (
    <div className="card mb-4 border border-amber-200 bg-amber-50">
      <h2 className="font-semibold text-amber-900 text-sm mb-1">
        Admin · GolfCourseAPI link
      </h2>
      {externalId ? (
        <>
          <p className="text-xs text-amber-800">
            Linked to <code className="font-mono">{externalId}</code>
            {lastFetchedAt && (
              <>
                {" · last refreshed "}
                {new Date(lastFetchedAt).toLocaleString()}
              </>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={busy}
              className="text-xs font-medium text-amber-900 px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 disabled:opacity-50"
            >
              {busy ? "Refreshing…" : "Refresh per-hole pars"}
            </button>
            <button
              type="button"
              onClick={() => setShowLink((v) => !v)}
              disabled={busy}
              className="text-xs font-medium text-amber-900 px-3 py-1.5 rounded-lg bg-white border border-amber-200 hover:bg-amber-100 disabled:opacity-50"
            >
              {showLink ? "Cancel re-link" : "Re-link to different API course"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-amber-800">
            This course was created manually — per-hole pars likely default to
            4. Search the GolfCourseAPI to attach real per-hole data.
          </p>
          <button
            type="button"
            onClick={() => setShowLink(true)}
            disabled={busy || showLink}
            className="mt-2 text-xs font-medium text-amber-900 px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 disabled:opacity-50"
          >
            Re-link to GolfCourseAPI
          </button>
        </>
      )}

      {status && (
        <div className="mt-2 text-xs text-green-800 bg-green-50 border border-green-200 px-2 py-1 rounded">
          {status}
        </div>
      )}
      {error && (
        <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded">
          {error}
        </div>
      )}

      {showLink && (
        <RelinkSearch
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
    </div>
  );
}

function RelinkSearch({
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
        const res = await fetch(
          `/api/courses/search?q=${encodeURIComponent(q)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (seq !== seqRef.current) return;
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        // Only show API hits — re-linking to a local row makes no sense here.
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
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm"
      />
      {searching && <div className="text-xs text-gray-500">Searching…</div>}
      {!searching && query.trim().length >= 2 && results.length === 0 && (
        <div className="text-xs text-gray-500">No API matches.</div>
      )}
      {results.length > 0 && (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md bg-white max-h-64 overflow-y-auto">
          {results.map((r) => {
            if (r.source !== "external") return null;
            const busy = linkingId === r.external_id;
            return (
              <li key={r.external_id}>
                <button
                  type="button"
                  disabled={Boolean(linkingId)}
                  onClick={() => link(r.external_id)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
                >
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {r.name}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {[r.city, r.state, r.country].filter(Boolean).join(", ") || "—"}
                    {" · "}
                    <code className="font-mono">{r.external_id}</code>
                  </div>
                  {busy && (
                    <div className="text-[10px] text-blue-700 mt-0.5">Linking…</div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="text-xs text-gray-500 hover:text-gray-700"
      >
        Cancel
      </button>
    </div>
  );
}
