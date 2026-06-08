"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { V2PageShell } from "@/components/v2/page-shell";
import { V2Card } from "@/components/v2/card";
import type { CourseSearchResult } from "@/app/api/courses/search/route";
import type { RecentSearchRow } from "@/app/api/recent-searches/route";

const INPUT_CLS =
  "w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-white placeholder-[var(--v2-muted)] focus:border-[var(--v2-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--v2-accent)]/40";

export function V2NewCourse() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [holes, setHoles] = useState<"9" | "18">("18");
  const [par, setPar] = useState("");
  const [courseRating, setCourseRating] = useState("");
  const [slopeRating, setSlopeRating] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CourseSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentSearchRow[]>([]);
  const searchSeqRef = useRef(0);
  const loggedQueryRef = useRef<string>("");

  const loadRecents = useCallback(async () => {
    try {
      const res = await fetch("/api/recent-searches", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setRecents(data.recent ?? []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadRecents();
  }, [loadRecents]);

  async function logSearch(q: string) {
    if (loggedQueryRef.current === q) return;
    loggedQueryRef.current = q;
    try {
      await fetch("/api/recent-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      loadRecents();
    } catch {
      // ignore
    }
  }

  async function clearRecents() {
    await fetch("/api/recent-searches", { method: "DELETE" });
    setRecents([]);
  }

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    const handle = setTimeout(async () => {
      const seq = ++searchSeqRef.current;
      setSearching(true);
      try {
        const res = await fetch(
          `/api/courses/search?q=${encodeURIComponent(q)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (seq !== searchSeqRef.current) return;
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        setSearchResults(data.results ?? []);
        setSearchError(data.external_error ?? null);
        setRateLimited(Boolean(data.rate_limited));
        if (!data.rate_limited) void logSearch(q);
      } catch (e) {
        if (seq !== searchSeqRef.current) return;
        setSearchError(e instanceof Error ? e.message : "Search failed");
        setSearchResults([]);
      } finally {
        if (seq === searchSeqRef.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  async function pickResult(result: CourseSearchResult) {
    if (result.source === "local") {
      router.push(`/courses/${result.local_id}`);
      router.refresh();
      return;
    }
    setImportingId(result.external_id);
    setSearchError(null);
    try {
      const res = await fetch("/api/courses/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ external_id: result.external_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      router.push(`/courses/${data.id}`);
      router.refresh();
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Import failed");
      setImportingId(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          city,
          address,
          holes: Number(holes),
          par: Number(par),
          slope_rating: slopeRating,
          course_rating: courseRating,
          phone,
          website,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      router.push(`/courses/${data.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSubmitting(false);
    }
  }

  return (
    <V2PageShell>
      <Link
        href="/courses"
        className="text-sm font-medium text-[var(--v2-accent)]"
      >
        ← Courses
      </Link>
      <h1 className="my-4 text-2xl font-bold text-[var(--v2-accent)]">
        Add a Course
      </h1>

      <V2Card className="mb-4 space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--v2-muted)]">
            Search GolfCourseAPI
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Type at least 2 characters…"
            className={INPUT_CLS}
          />
          <p className="mt-1 text-xs text-[var(--v2-muted)]">
            Pulls real per-hole pars. One API call per imported course — then it&rsquo;s cached forever.
          </p>
        </div>

        {searching && (
          <div className="text-xs text-[var(--v2-muted)]">Searching…</div>
        )}
        {rateLimited ? (
          <div className="rounded border border-[var(--v2-warn-border)] bg-[var(--v2-warn-bg)] p-2.5 text-xs text-[var(--v2-warn-text-strong)]">
            <div className="mb-0.5 font-semibold text-[var(--v2-warn-text)]">
              ⏱ Daily search limit reached
            </div>
            <div>
              GolfCourseAPI free tier caps at 300 requests/day. Saved courses
              still load. New imports resume tomorrow — or add a course manually
              below for now.
            </div>
          </div>
        ) : searchError ? (
          <div className="rounded border border-[var(--v2-warn-border)] bg-[var(--v2-warn-bg)] px-2 py-1 text-xs text-[var(--v2-warn-text-strong)]">
            {searchError}
          </div>
        ) : null}

        {!searchQuery.trim() && recents.length > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--v2-muted)]">
                Recent searches
              </span>
              <button
                type="button"
                onClick={clearRecents}
                className="text-[10px] text-[var(--v2-muted)] hover:text-white"
              >
                Clear
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {recents.map((r) => (
                <button
                  key={r.query}
                  type="button"
                  onClick={() => setSearchQuery(r.query)}
                  className="rounded-full bg-[var(--v2-surface-2)] px-2 py-1 text-xs text-[var(--v2-fg)] hover:bg-[var(--v2-border)]"
                >
                  {r.query}
                </button>
              ))}
            </div>
          </div>
        )}

        {searchResults.length > 0 && (
          <ul className="divide-y divide-[var(--v2-border)] rounded-md border border-[var(--v2-border)] bg-[var(--v2-surface-2)]">
            {searchResults.map((r) => {
              const key =
                r.source === "local" ? `L${r.local_id}` : `E${r.external_id}`;
              const importing =
                r.source === "external" && importingId === r.external_id;
              return (
                <li key={key}>
                  <button
                    type="button"
                    disabled={importing}
                    onClick={() => pickResult(r)}
                    className="w-full px-3 py-2 text-left hover:bg-[var(--v2-surface)] disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-white">
                        {r.name}
                      </span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                          r.source === "local"
                            ? "bg-[var(--v2-score)]/20 text-[var(--v2-score-soft)]"
                            : "bg-[var(--v2-blue-fill)] text-[var(--v2-blue-text)]"
                        }`}
                      >
                        {r.source === "local" ? "saved" : "import"}
                      </span>
                    </div>
                    <div className="truncate text-xs text-[var(--v2-muted)]">
                      {[r.city, r.state, r.country].filter(Boolean).join(", ") ||
                        "—"}
                      {r.source === "local" &&
                        ` · ${r.holes} holes · par ${r.par}`}
                    </div>
                    {importing && (
                      <div className="mt-0.5 text-[10px] text-[var(--v2-blue-text)]">
                        Importing…
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </V2Card>

      <details className="mb-4">
        <summary className="cursor-pointer text-sm font-medium text-[var(--v2-accent)]">
          Or enter a course manually
        </summary>
      </details>

      {error && (
        <div className="mb-4 rounded-lg bg-[var(--v2-danger-bg)] p-3 text-sm text-[var(--v2-red-text)]">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <V2Card className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--v2-muted)]">
              Course name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Twin Lakes Golf Club"
              className={INPUT_CLS}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="mb-1 block text-sm font-medium text-[var(--v2-muted)]">
                City
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Clarkston"
                className={INPUT_CLS}
                required
              />
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-sm font-medium text-[var(--v2-muted)]">
                Holes
              </label>
              <div className="flex gap-2">
                {(["9", "18"] as const).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHoles(h)}
                    className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                      holes === h
                        ? "bg-[var(--v2-accent)] text-black"
                        : "border border-[var(--v2-border)] bg-[var(--v2-surface)] text-[var(--v2-muted)]"
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--v2-muted)]">
              Address{" "}
              <span className="font-normal text-[var(--v2-muted)]/70">
                (optional)
              </span>
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={INPUT_CLS}
            />
          </div>
        </V2Card>

        <V2Card>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--v2-muted)]">
                Par
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={par}
                onChange={(e) => setPar(e.target.value)}
                min={27}
                max={100}
                placeholder={holes === "18" ? "72" : "36"}
                className={INPUT_CLS}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--v2-muted)]">
                Rating
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={courseRating}
                onChange={(e) => setCourseRating(e.target.value)}
                placeholder="e.g. 71.2"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--v2-muted)]">
                Slope
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={slopeRating}
                onChange={(e) => setSlopeRating(e.target.value)}
                placeholder="e.g. 128"
                className={INPUT_CLS}
              />
            </div>
          </div>
        </V2Card>

        <V2Card className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--v2-muted)]">
              Phone{" "}
              <span className="font-normal text-[var(--v2-muted)]/70">
                (optional)
              </span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="248-555-1234"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--v2-muted)]">
              Website{" "}
              <span className="font-normal text-[var(--v2-muted)]/70">
                (optional)
              </span>
            </label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              className={INPUT_CLS}
            />
          </div>
        </V2Card>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-[var(--v2-accent)] py-3 font-semibold text-black hover:bg-[var(--v2-accent-soft)] disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Add Course"}
        </button>
      </form>
    </V2PageShell>
  );
}
