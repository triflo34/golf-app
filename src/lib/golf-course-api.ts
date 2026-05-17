import "server-only";

/**
 * GolfCourseAPI.com client.
 *
 * The exact JSON response shape is behind their login docs. The two parsers
 * below (`parseSearchResponse`, `parseCourseDetail`) are written defensively
 * with best-guess field names — verify against a real response and adjust if
 * needed. Internal types are what the rest of the app uses; only the parsers
 * should change when the external shape is confirmed.
 */

const API_BASE = process.env.GOLFCOURSE_API_BASE ?? "https://api.golfcourseapi.com/v1";
const FETCH_TIMEOUT_MS = 8000;

export type CourseApiError = { status: number; message: string };

export class GolfCourseApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "GolfCourseApiError";
  }
}

export type ExternalSearchHit = {
  external_id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type ExternalCourseHole = {
  hole_number: number;
  par: number;
  handicap: number | null;
  yardage: number | null;
};

export type ExternalCourseDetail = {
  external_id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  hole_count: number;
  total_par: number | null;
  holes: ExternalCourseHole[];
  raw: unknown; // kept for debugging if parser shape needs adjusting
};

function getApiKey(): string {
  const key = process.env.GOLFCOURSE_API_KEY;
  if (!key) {
    throw new GolfCourseApiError(
      500,
      "GOLFCOURSE_API_KEY is not set. Add it to .env.local and Vercel env vars.",
    );
  }
  return key;
}

async function apiFetch(path: string, query?: Record<string, string>): Promise<unknown> {
  const key = getApiKey();
  const url = new URL(`${API_BASE}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== "") url.searchParams.set(k, v);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Key ${key}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GolfCourseApiError(
        res.status,
        `GolfCourseAPI ${path} returned ${res.status}: ${text.slice(0, 200)}`,
      );
    }
    return await res.json();
  } catch (err) {
    if (err instanceof GolfCourseApiError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new GolfCourseApiError(502, `GolfCourseAPI ${path} failed: ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

// =====================================================================
// PARSERS — verify against actual GolfCourseAPI responses.
// =====================================================================

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/**
 * Best-guess search response parser. Likely shapes (try each):
 *   { courses: [ { id, club_name, course_name, location:{ city, state, country, latitude, longitude } } ] }
 *   { data:    [ ... ] }
 *   [ ... ]                                  // bare array
 */
function parseSearchResponse(raw: unknown): ExternalSearchHit[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { courses?: unknown }).courses)
      ? ((raw as { courses: unknown[] }).courses)
      : Array.isArray((raw as { data?: unknown }).data)
        ? ((raw as { data: unknown[] }).data)
        : Array.isArray((raw as { results?: unknown }).results)
          ? ((raw as { results: unknown[] }).results)
          : [];

  return list
    .map((row): ExternalSearchHit | null => {
      const r = row as Record<string, unknown>;
      const id =
        asString(r.id) ??
        asString(r.course_id) ??
        (typeof r.id === "number" ? String(r.id) : null);
      if (!id) return null;
      const name =
        asString(r.course_name) ??
        asString(r.club_name) ??
        asString(r.name) ??
        "Unknown course";
      const loc = (r.location ?? r.address ?? {}) as Record<string, unknown>;
      return {
        external_id: id,
        name,
        city: asString(r.city) ?? asString(loc.city),
        state: asString(r.state) ?? asString(loc.state),
        country: asString(r.country) ?? asString(loc.country),
        latitude: asNumber(r.latitude) ?? asNumber(loc.latitude),
        longitude: asNumber(r.longitude) ?? asNumber(loc.longitude),
      };
    })
    .filter((x): x is ExternalSearchHit => x !== null);
}

/**
 * Best-guess detail parser. Likely shape (per spec):
 *   {
 *     id, club_name, course_name, location:{...}, holes:[{hole, par, handicap, yards}],
 *     tees:[{tee_name, gender, total_yards, course_rating, slope, holes:[...]}],
 *     ...
 *   }
 * Permissive about envelope shape and id field names; falls back to the
 * external_id we used to make the request.
 */
function parseCourseDetail(raw: unknown, fallbackId: string): ExternalCourseDetail {
  // Some APIs wrap the response: { course: {...} } or { data: {...} }.
  const top = raw as Record<string, unknown>;
  let r = top;
  if (top.course && typeof top.course === "object") {
    r = top.course as Record<string, unknown>;
  } else if (top.data && typeof top.data === "object") {
    r = top.data as Record<string, unknown>;
  } else if (top.result && typeof top.result === "object") {
    r = top.result as Record<string, unknown>;
  }

  const idCandidate =
    asString(r.id) ??
    asString(r.course_id) ??
    asString(r._id) ??
    (typeof r.id === "number" ? String(r.id) : null) ??
    (typeof r.course_id === "number" ? String(r.course_id) : null);
  const id = idCandidate ?? fallbackId;

  if (process.env.NODE_ENV !== "production") {
    console.log("[GolfCourseAPI] detail keys:", Object.keys(r));
  }

  const name =
    asString(r.course_name) ??
    asString(r.club_name) ??
    asString(r.name) ??
    "Unknown course";
  const loc = (r.location ?? r.address ?? {}) as Record<string, unknown>;

  // Hole list. Three known shapes:
  //   1. r.holes = [ { par, ... }, ... ]                        (top-level)
  //   2. r.tees = [ { holes: [...] }, ... ]                     (array of tees)
  //   3. r.tees = { male: [ { holes: [...] }, ... ], female: [...] }   (GolfCourseAPI)
  let rawHoles: unknown[] = Array.isArray(r.holes) ? (r.holes as unknown[]) : [];
  let chosenTee: Record<string, unknown> | null = null;

  function firstTeeFromArr(arr: unknown[]): Record<string, unknown> | null {
    const tee = arr[0] as Record<string, unknown> | undefined;
    if (tee && Array.isArray(tee.holes) && (tee.holes as unknown[]).length > 0) {
      return tee;
    }
    return null;
  }

  if (rawHoles.length === 0) {
    if (Array.isArray(r.tees)) {
      chosenTee = firstTeeFromArr(r.tees as unknown[]);
    } else if (r.tees && typeof r.tees === "object") {
      const teesObj = r.tees as Record<string, unknown>;
      // Prefer male, fall back to female, then any other gender bucket.
      const buckets: unknown[] = [
        teesObj.male,
        teesObj.female,
        ...Object.values(teesObj).filter((v) => v !== teesObj.male && v !== teesObj.female),
      ];
      for (const b of buckets) {
        if (Array.isArray(b)) {
          chosenTee = firstTeeFromArr(b);
          if (chosenTee) break;
        }
      }
    }
    if (chosenTee && Array.isArray(chosenTee.holes)) {
      rawHoles = chosenTee.holes as unknown[];
    }
  }

  // If we still couldn't find holes, dump the response so we can iterate.
  if (rawHoles.length === 0) {
    console.warn(
      "[GolfCourseAPI] no holes found in detail response — raw body follows:\n" +
        JSON.stringify(raw, null, 2).slice(0, 4000),
    );
  }

  const holes: ExternalCourseHole[] = rawHoles
    .map((h, idx): ExternalCourseHole | null => {
      const hr = h as Record<string, unknown>;
      const hole_number =
        asNumber(hr.hole_number) ??
        asNumber(hr.hole) ??
        asNumber(hr.number) ??
        idx + 1;
      const par = asNumber(hr.par);
      if (par == null || !Number.isInteger(hole_number)) return null;
      return {
        hole_number,
        par,
        handicap:
          asNumber(hr.handicap) ??
          asNumber(hr.hcp) ??
          asNumber(hr.handicap_index) ??
          asNumber(hr.stroke_index),
        yardage:
          asNumber(hr.yardage) ??
          asNumber(hr.yards) ??
          asNumber(hr.distance) ??
          null,
      };
    })
    .filter((x): x is ExternalCourseHole => x !== null);

  const totalPar = holes.reduce((sum, h) => sum + h.par, 0) || asNumber(r.par) || null;

  return {
    external_id: id,
    name,
    city: asString(r.city) ?? asString(loc.city),
    state: asString(r.state) ?? asString(loc.state),
    country: asString(r.country) ?? asString(loc.country),
    latitude: asNumber(r.latitude) ?? asNumber(loc.latitude),
    longitude: asNumber(r.longitude) ?? asNumber(loc.longitude),
    hole_count: holes.length || (asNumber(r.holes_count) ?? 18),
    total_par: totalPar,
    holes,
    raw,
  };
}

// =====================================================================
// Public API
// =====================================================================

export async function searchCoursesExternal(q: string): Promise<ExternalSearchHit[]> {
  if (q.trim().length < 2) return [];
  const raw = await apiFetch("/search", { search_query: q.trim() });
  return parseSearchResponse(raw);
}

export async function fetchCourseDetailExternal(
  externalId: string,
): Promise<ExternalCourseDetail> {
  if (!externalId) {
    throw new GolfCourseApiError(400, "external_id is required");
  }
  const raw = await apiFetch(`/courses/${encodeURIComponent(externalId)}`);
  return parseCourseDetail(raw, externalId);
}
