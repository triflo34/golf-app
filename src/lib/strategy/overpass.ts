import "server-only";
import type { GeoJSONFeature, GeoJSONFeatureCollection, LatLng } from "./types";

/**
 * Overpass API integration (free OpenStreetMap query service).
 *
 * Free-tier etiquette baked in:
 *  - results are cached in Postgres by the API layer (30-day TTL), so a course
 *    is fetched from Overpass roughly once a month, not per page view
 *  - multiple public endpoints with failover + one retry
 *  - a single combined query per course (not per hole)
 */

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const FETCH_TIMEOUT_MS = 30_000;

type OverpassElement = {
  type: "way" | "relation" | "node";
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  center?: { lat: number; lon: number };
  members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[];
};

type OverpassResponse = { elements: OverpassElement[] };

async function overpassQuery(query: string): Promise<OverpassResponse> {
  let lastErr: Error | null = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.status === 429 || res.status === 504) {
          lastErr = new Error(`Overpass busy (${res.status}) at ${endpoint}`);
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        if (!res.ok) {
          lastErr = new Error(`Overpass HTTP ${res.status} at ${endpoint}`);
          break; // try next endpoint
        }
        return (await res.json()) as OverpassResponse;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
      }
    }
  }
  throw lastErr ?? new Error("Overpass query failed");
}

/** Resolve a course name to a lat/lng via OSM (leisure=golf_course). */
export async function geocodeCourseByName(name: string): Promise<LatLng | null> {
  // Escape regex specials so a course name can't break the query.
  const safe = name.replace(/[.*+?^${}()|[\]\\"]/g, (c) => `\\${c}`);
  const q = `
[out:json][timeout:30];
(
  way["leisure"="golf_course"]["name"~"${safe}",i];
  relation["leisure"="golf_course"]["name"~"${safe}",i];
);
out center 1;`;
  const data = await overpassQuery(q);
  const el = data.elements.find((e) => e.center);
  return el?.center ? { lat: el.center.lat, lng: el.center.lon } : null;
}

/**
 * Fetch all golf features within `radiusM` of a point and normalize to
 * GeoJSON. Closed ways → Polygon, open ways → LineString. The `golf` tag (or
 * water/cartpath classification) is preserved in feature.properties.kind.
 */
export async function fetchCourseFeatures(
  center: LatLng,
  radiusM = 2000,
): Promise<GeoJSONFeatureCollection> {
  const around = `(around:${radiusM},${center.lat},${center.lng})`;
  const q = `
[out:json][timeout:60];
(
  way["golf"="fairway"]${around};
  way["golf"="green"]${around};
  way["golf"="bunker"]${around};
  way["golf"="tee"]${around};
  way["golf"="hole"]${around};
  way["golf"="water_hazard"]${around};
  way["golf"="lateral_water_hazard"]${around};
  way["natural"="water"]${around};
  way["golf"="cartpath"]${around};
  way["golf"="path"]${around};
  way["highway"="path"]["golf:cartpath"="yes"]${around};
);
out geom;`;

  const data = await overpassQuery(q);
  const features: GeoJSONFeature[] = [];

  for (const el of data.elements) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
    const tags = el.tags ?? {};
    const kind = classify(tags);
    if (!kind) continue;

    const coords = el.geometry.map((p) => [p.lon, p.lat]);
    const closed =
      coords.length >= 4 &&
      coords[0][0] === coords[coords.length - 1][0] &&
      coords[0][1] === coords[coords.length - 1][1];

    // Hole centerlines and cart paths are lines; everything else should be a
    // polygon (close it if the mapper left a sliver of a gap).
    const wantsLine = kind === "hole" || kind === "cartpath";
    if (wantsLine) {
      features.push({
        type: "Feature",
        properties: { kind, osmId: el.id, ref: tags.ref ?? null, par: tags.par ?? null, name: tags.name ?? null },
        geometry: { type: "LineString", coordinates: coords },
      });
    } else {
      const ring = closed ? coords : [...coords, coords[0]];
      if (ring.length < 4) continue;
      features.push({
        type: "Feature",
        properties: { kind, osmId: el.id, ref: tags.ref ?? null, name: tags.name ?? null },
        geometry: { type: "Polygon", coordinates: [ring] },
      });
    }
  }

  return { type: "FeatureCollection", features };
}

function classify(tags: Record<string, string>): string | null {
  const golf = tags.golf;
  if (golf === "fairway") return "fairway";
  if (golf === "green") return "green";
  if (golf === "bunker") return "bunker";
  if (golf === "tee") return "tee";
  if (golf === "hole") return "hole";
  if (golf === "water_hazard" || golf === "lateral_water_hazard") return "water";
  if (golf === "cartpath" || golf === "path") return "cartpath";
  if (tags["golf:cartpath"] === "yes") return "cartpath";
  if (tags.natural === "water") return "water";
  return null;
}
