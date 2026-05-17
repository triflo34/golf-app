"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CourseSearchResult } from "@/app/api/courses/search/route";

export default function NewCoursePage() {
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

  // Course search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CourseSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const searchSeqRef = useRef(0);

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
        const res = await fetch(`/api/courses/search?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (seq !== searchSeqRef.current) return; // stale
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        setSearchResults(data.results ?? []);
        setSearchError(data.external_error ?? null);
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
    <div className="max-w-lg mx-auto px-4 py-6">
      <Link href="/courses" className="text-sm text-green-700 font-medium">
        ← Courses
      </Link>
      <h1 className="text-2xl font-bold text-green-800 my-4">Add a Course</h1>

      <section className="card mb-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Search GolfCourseAPI
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Type at least 2 characters…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
          />
          <p className="mt-1 text-xs text-gray-500">
            Pulls real per-hole pars. One API call per imported course — then it&rsquo;s cached forever.
          </p>
        </div>

        {searching && <div className="text-xs text-gray-500">Searching…</div>}
        {searchError && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
            {searchError}
          </div>
        )}
        {searchResults.length > 0 && (
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md bg-white">
            {searchResults.map((r) => {
              const key = r.source === "local" ? `L${r.local_id}` : `E${r.external_id}`;
              const importing = r.source === "external" && importingId === r.external_id;
              return (
                <li key={key}>
                  <button
                    type="button"
                    disabled={importing}
                    onClick={() => pickResult(r)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {r.name}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                          r.source === "local"
                            ? "bg-green-100 text-green-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {r.source === "local" ? "saved" : "import"}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {[r.city, r.state, r.country].filter(Boolean).join(", ") || "—"}
                      {r.source === "local" && ` · ${r.holes} holes · par ${r.par}`}
                    </div>
                    {importing && (
                      <div className="text-[10px] text-blue-700 mt-0.5">Importing…</div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <details className="mb-4">
        <summary className="text-sm font-medium text-green-700 cursor-pointer">
          Or enter a course manually
        </summary>
      </details>

      {error && (
        <div className="mb-4 bg-red-50 text-red-600 text-sm p-3 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div className="card space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Course name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Twin Lakes Golf Club"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                City
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Clarkston"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Holes
              </label>
              <div className="flex gap-2">
                {(["9", "18"] as const).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHoles(h)}
                    className={`flex-1 py-2 rounded-lg font-medium text-sm transition ${
                      holes === h
                        ? "bg-green-700 text-white"
                        : "bg-white text-gray-600 border border-gray-200"
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Address <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
            />
          </div>
        </div>

        <div className="card grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Par</label>
            <input
              type="number"
              inputMode="numeric"
              value={par}
              onChange={(e) => setPar(e.target.value)}
              min={27}
              max={100}
              placeholder={holes === "18" ? "72" : "36"}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rating
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={courseRating}
              onChange={(e) => setCourseRating(e.target.value)}
              placeholder="e.g. 71.2"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Slope
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={slopeRating}
              onChange={(e) => setSlopeRating(e.target.value)}
              placeholder="e.g. 128"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
            />
          </div>
        </div>

        <div className="card space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="248-555-1234"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Website <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-green-700 text-white font-medium rounded-lg hover:bg-green-800 disabled:opacity-50 transition"
        >
          {submitting ? "Saving..." : "Add Course"}
        </button>
      </form>
    </div>
  );
}
