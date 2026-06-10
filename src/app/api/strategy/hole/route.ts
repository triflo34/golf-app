import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { fetchCourseFeatures, geocodeCourseByName } from "@/lib/strategy/overpass";
import { buildHoleModels } from "@/lib/strategy/hole-model";
import { generateStrategy } from "@/lib/strategy/caddie";
import { buildHoleFeatures } from "@/lib/strategy/overlays";
import { DEMO_COURSE_GEO } from "@/lib/strategy/fixture";
import { buildManualHoleData, type ManualHoleRow } from "@/lib/strategy/manual";
import type { CourseGeo, HoleData, LatLng } from "@/lib/strategy/types";

/**
 * Hole strategy service.
 *
 * GET /api/strategy/hole?courseId=12&hole=4&drive=240
 * GET /api/strategy/hole?courseName=Evergreen%20Hills&hole=1
 * GET /api/strategy/hole?demo=1&hole=1
 *
 * Returns the normalized hole GeoJSON, the hole model (centerline, length,
 * carries), and the caddie strategy for the given drive distance. Data comes
 * from OpenStreetMap via Overpass (free) and is cached in Postgres per course
 * for CACHE_TTL_MS; `refresh=1` forces a refetch.
 */

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Name-only lookups (course not in our DB) get a small in-memory cache so
// repeated views don't hammer Overpass between deploys.
const nameCache = new Map<string, { geo: CourseGeo; at: number }>();

type CourseRow = {
  id: number;
  name: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
};

async function loadFromOverpass(center: LatLng): Promise<Pick<CourseGeo, "geojson" | "holes" | "availableHoles">> {
  const geojson = await fetchCourseFeatures(center);
  const holes = buildHoleModels(geojson);
  return { geojson, holes, availableHoles: holes.map((h) => h.holeNumber) };
}

async function geoForCourseRow(course: CourseRow, refresh: boolean): Promise<CourseGeo> {
  // The cache is an optimization — never let it take the feature down. If the
  // table is missing (e.g. migration hasn't run yet) fall through to Overpass.
  let cached: { center_lat: number; center_lng: number; geojson: unknown; holes: unknown; fetched_at: string } | undefined;
  if (!refresh) {
    try {
      cached = await db
        .prepare(
          `SELECT center_lat, center_lng, geojson, holes, fetched_at
           FROM course_geo_cache WHERE course_id = ?`,
        )
        .get<{ center_lat: number; center_lng: number; geojson: unknown; holes: unknown; fetched_at: string }>(
          course.id,
        );
    } catch (e) {
      console.error("[strategy] cache read failed:", e instanceof Error ? e.message : e);
    }
    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
      const holes = (typeof cached.holes === "string" ? JSON.parse(cached.holes) : cached.holes) as HoleData[];
      const geojson = (typeof cached.geojson === "string" ? JSON.parse(cached.geojson) : cached.geojson) as CourseGeo["geojson"];
      return {
        center: { lat: cached.center_lat, lng: cached.center_lng },
        availableHoles: holes.map((h) => h.holeNumber),
        holes,
        geojson,
        source: "cache",
        fetchedAt: cached.fetched_at,
      };
    }
  }

  let center: LatLng | null =
    course.latitude != null && course.longitude != null
      ? { lat: course.latitude, lng: course.longitude }
      : null;
  if (!center) center = await geocodeCourseByName(course.name);
  if (!center) {
    throw new HttpError(404, `Couldn't locate "${course.name}" on OpenStreetMap. Add latitude/longitude to the course, or try demo mode.`);
  }

  const { geojson, holes, availableHoles } = await loadFromOverpass(center);
  const fetchedAt = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO course_geo_cache (course_id, center_lat, center_lng, geojson, holes, fetched_at)
         VALUES (?, ?, ?, ?::jsonb, ?::jsonb, ?)
         ON CONFLICT (course_id) DO UPDATE SET
           center_lat = EXCLUDED.center_lat, center_lng = EXCLUDED.center_lng,
           geojson = EXCLUDED.geojson, holes = EXCLUDED.holes, fetched_at = EXCLUDED.fetched_at`,
      )
      .run(course.id, center.lat, center.lng, JSON.stringify(geojson), JSON.stringify(holes), fetchedAt);
  } catch (e) {
    console.error("[strategy] cache write failed:", e instanceof Error ? e.message : e);
  }

  return { center, availableHoles, holes, geojson, source: "overpass", fetchedAt };
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const demo = url.searchParams.get("demo") === "1";
  const courseIdParam = url.searchParams.get("courseId");
  const courseName = url.searchParams.get("courseName")?.trim() ?? "";
  const holeNumber = Number(url.searchParams.get("hole") ?? "1");
  const drive = Number(url.searchParams.get("drive") ?? "230");
  const refresh = url.searchParams.get("refresh") === "1";

  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 36) {
    return NextResponse.json({ error: "Invalid hole number" }, { status: 400 });
  }
  if (!Number.isFinite(drive) || drive < 100 || drive > 400) {
    return NextResponse.json({ error: "drive must be 100–400 yards" }, { status: 400 });
  }

  try {
    let geo: CourseGeo;
    let courseLabel = "Demo course";

    if (demo) {
      geo = DEMO_COURSE_GEO;
    } else if (courseIdParam) {
      const courseId = Number(courseIdParam);
      if (!Number.isInteger(courseId) || courseId <= 0) {
        return NextResponse.json({ error: "Invalid course id" }, { status: 400 });
      }
      const course = await db
        .prepare("SELECT id, name, city, state, latitude, longitude FROM courses WHERE id = ?")
        .get<CourseRow>(courseId);
      if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });
      courseLabel = course.name;

      // DB hole pars are authoritative over the length heuristic.
      const dbHoles = await db
        .prepare("SELECT hole_number, par FROM course_holes WHERE course_id = ?")
        .all<{ hole_number: number; par: number }>(courseId);
      const parByHole = new Map(dbHoles.map((h) => [h.hole_number, h.par]));

      // PRIMARY source: holes our users placed in the satellite editor
      // (tee + green per hole). No network, no rate limits, works for every
      // course. OSM/Overpass is the fallback for holes not yet set up.
      const manualRows = await db
        .prepare(
          `SELECT hole_number, tee_lat, tee_lng, green_lat, green_lng, hazards
           FROM course_hole_geo WHERE course_id = ? ORDER BY hole_number ASC`,
        )
        .all<ManualHoleRow>(courseId);
      const manualForHole = manualRows.find((r) => r.hole_number === holeNumber);

      if (manualForHole) {
        const holes = manualRows.map((r) =>
          buildManualHoleData(r, parByHole.get(r.hole_number) ?? null),
        );
        geo = {
          center: { lat: manualForHole.tee_lat, lng: manualForHole.tee_lng },
          availableHoles: holes.map((h) => h.holeNumber),
          holes,
          geojson: { type: "FeatureCollection", features: [] },
          source: "manual",
          fetchedAt: new Date().toISOString(),
        };
      } else {
        try {
          geo = await geoForCourseRow(course, refresh);
        } catch (e) {
          // OSM unavailable (rate-limited / blocked / unmapped). If the user
          // has set up ANY holes manually, surface those rather than failing.
          if (manualRows.length === 0) throw e;
          const holes = manualRows.map((r) =>
            buildManualHoleData(r, parByHole.get(r.hole_number) ?? null),
          );
          geo = {
            center: { lat: manualRows[0].tee_lat, lng: manualRows[0].tee_lng },
            availableHoles: holes.map((h) => h.holeNumber),
            holes,
            geojson: { type: "FeatureCollection", features: [] },
            source: "manual",
            fetchedAt: new Date().toISOString(),
          };
        }
        // Merge any manual holes over the OSM set (manual wins per hole).
        if (geo.source !== "manual" && manualRows.length > 0) {
          const manualHoles = manualRows.map((r) =>
            buildManualHoleData(r, parByHole.get(r.hole_number) ?? null),
          );
          const byNumber = new Map(geo.holes.map((h) => [h.holeNumber, h]));
          for (const mh of manualHoles) byNumber.set(mh.holeNumber, mh);
          geo = {
            ...geo,
            holes: [...byNumber.values()].sort((a, b) => a.holeNumber - b.holeNumber),
            availableHoles: [...byNumber.keys()].sort((a, b) => a - b),
          };
        }
      }

      for (const h of geo.holes) {
        const dbPar = parByHole.get(h.holeNumber);
        if (dbPar) h.par = dbPar;
      }
    } else if (courseName) {
      courseLabel = courseName;
      const hit = nameCache.get(courseName.toLowerCase());
      if (!refresh && hit && Date.now() - hit.at < CACHE_TTL_MS) {
        geo = hit.geo;
      } else {
        const center = await geocodeCourseByName(courseName);
        if (!center) {
          return NextResponse.json(
            { error: `Couldn't find a golf course named "${courseName}" on OpenStreetMap` },
            { status: 404 },
          );
        }
        const { geojson, holes, availableHoles } = await loadFromOverpass(center);
        geo = { center, availableHoles, holes, geojson, source: "overpass", fetchedAt: new Date().toISOString() };
        nameCache.set(courseName.toLowerCase(), { geo, at: Date.now() });
      }
    } else {
      return NextResponse.json({ error: "courseId, courseName, or demo=1 required" }, { status: 400 });
    }

    const hole = geo.holes.find((h) => h.holeNumber === holeNumber);
    if (!hole) {
      return NextResponse.json(
        {
          error:
            geo.availableHoles.length === 0
              ? `No hole data for ${courseLabel} yet — set up the tee and green for each hole right on the map.`
              : `Hole ${holeNumber} isn't set up for ${courseLabel} yet.`,
          available_holes: geo.availableHoles,
          source: geo.source,
          // The in-app satellite editor can fix this for DB courses.
          setup_available: Boolean(courseIdParam),
        },
        { status: 404 },
      );
    }

    const strategy = generateStrategy(hole, { averageDriveDistance: drive });

    return NextResponse.json({
      course: courseLabel,
      source: geo.source,
      fetched_at: geo.fetchedAt,
      available_holes: geo.availableHoles,
      hole,
      geojson: buildHoleFeatures(hole),
      strategy,
    });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Strategy fetch failed";
    // Overpass unreachable (blocked egress / rate limit) → offer the editor
    // (the no-network path) instead of failing opaquely.
    return NextResponse.json(
      { error: `Course data fetch failed: ${msg}`, demo_available: true, setup_available: true },
      { status: 502 },
    );
  }
}
