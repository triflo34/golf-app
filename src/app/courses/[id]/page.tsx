"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { CourseDetail } from "@/app/api/courses/[id]/route";
import type { CourseSearchResult } from "@/app/api/courses/search/route";
import { useAuth } from "@/components/auth-provider";

export default function CourseDetailPage() {
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
        <h1 className="text-2xl font-bold text-green-800 mb-1">{c.name}</h1>
        <div className="text-sm text-gray-500">{c.city}, {c.state}</div>
        {c.address && (
          <div className="text-xs text-gray-400 mt-1">{c.address}</div>
        )}

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

      {user?.is_admin && (
        <AdminApiPanel
          courseId={c.id}
          externalId={c.external_id ?? null}
          lastFetchedAt={c.last_fetched_at ?? null}
          courseName={c.name}
          onChanged={load}
        />
      )}

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
      const res = await fetch(`/api/admin/courses/${courseId}/refresh`, {
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
