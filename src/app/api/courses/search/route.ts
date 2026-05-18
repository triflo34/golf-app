import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  GolfCourseApiError,
  searchCoursesExternal,
  type ExternalSearchHit,
} from "@/lib/golf-course-api";

type LocalCourseRow = {
  id: number;
  name: string;
  city: string;
  state: string;
  external_id: string | null;
  holes: number;
  par: number;
};

export type CourseSearchResult =
  | {
      source: "local";
      local_id: number;
      external_id: string | null;
      name: string;
      city: string | null;
      state: string | null;
      country: string | null;
      holes: number;
      par: number;
    }
  | {
      source: "external";
      external_id: string;
      name: string;
      city: string | null;
      state: string | null;
      country: string | null;
    };

export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const localRows = await db
    .prepare(
      `SELECT id, name, city, state, external_id, holes, par
       FROM courses
       WHERE name ILIKE ? OR city ILIKE ?
       ORDER BY name ASC LIMIT 25`,
    )
    .all<LocalCourseRow>(`%${q}%`, `%${q}%`);

  const local: CourseSearchResult[] = localRows.map((r) => ({
    source: "local",
    local_id: r.id,
    external_id: r.external_id,
    name: r.name,
    city: r.city,
    state: r.state,
    country: null,
    holes: r.holes,
    par: r.par,
  }));

  const localExternalIds = new Set(
    localRows.map((r) => r.external_id).filter((x): x is string => Boolean(x)),
  );

  let external: CourseSearchResult[] = [];
  let externalError: string | null = null;
  let rateLimited = false;

  if (process.env.GOLFCOURSE_API_KEY) {
    try {
      const hits: ExternalSearchHit[] = await searchCoursesExternal(q);
      external = hits
        .filter((h) => !localExternalIds.has(h.external_id))
        .map((h) => ({
          source: "external" as const,
          external_id: h.external_id,
          name: h.name,
          city: h.city,
          state: h.state,
          country: h.country,
        }));
    } catch (err) {
      if (err instanceof GolfCourseApiError && err.status === 429) {
        rateLimited = true;
        externalError =
          "GolfCourseAPI daily rate limit reached. Saved courses still work; new searches resume tomorrow.";
      } else {
        externalError =
          err instanceof GolfCourseApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "External search failed";
      }
    }
  } else {
    externalError = "GOLFCOURSE_API_KEY not set — external search disabled";
  }

  return NextResponse.json({
    results: [...local, ...external],
    external_error: externalError,
    rate_limited: rateLimited,
  });
}
