import * as turf from "@turf/turf";
import type {
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  HazardCarry,
  HoleData,
  HoleFeature,
  LatLng,
  PolygonCoords,
} from "./types";
import { metersToYards } from "./types";

/**
 * Hole modeling: convert a normalized course FeatureCollection into per-hole
 * models. Relies on OSM `golf=hole` centerline ways (ref=N) — the standard way
 * well-mapped courses are tagged. Features are assigned to a hole when they
 * intersect a corridor buffered around its centerline.
 */

const CORRIDOR_M = 55; // half-width of the playing corridor used for assignment
const GREEN_SNAP_M = 80; // how far the centerline end may sit from "its" green

type LineFeature = GeoJSON.Feature<GeoJSON.LineString>;

function toLatLng(pos: number[]): LatLng {
  return { lat: pos[1], lng: pos[0] };
}

function polygonOf(f: GeoJSONFeature): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: f.geometry.coordinates as GeoJSON.Position[][] },
  };
}

function holeFeatureOf(f: GeoJSONFeature): HoleFeature {
  return {
    coordinates: f.geometry.coordinates as PolygonCoords,
    osmId: typeof f.properties.osmId === "number" ? f.properties.osmId : undefined,
  };
}

/** Par fallback by length when neither OSM nor the DB knows it. */
export function parFromLength(lengthYards: number): number {
  if (lengthYards < 245) return 3;
  if (lengthYards < 471) return 4;
  return 5;
}

export function buildHoleModels(geojson: GeoJSONFeatureCollection): HoleData[] {
  const byKind = (k: string) => geojson.features.filter((f) => f.properties.kind === k);
  const holeLines = byKind("hole").filter((f) => f.geometry.type === "LineString");
  const greens = byKind("green");
  const fairways = byKind("fairway");
  const bunkers = byKind("bunker");
  const waters = byKind("water");
  const cartpaths = byKind("cartpath");

  const models: HoleData[] = [];

  for (const holeFeature of holeLines) {
    const ref = Number(holeFeature.properties.ref);
    if (!Number.isInteger(ref) || ref <= 0) continue;

    const line: LineFeature = {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: holeFeature.geometry.coordinates as GeoJSON.Position[] },
    };
    const coords = line.geometry.coordinates as number[][];
    const tee = toLatLng(coords[0]);
    const endPos = coords[coords.length - 1];

    const lengthYards = metersToYards(turf.length(line, { units: "kilometers" }) * 1000);

    // Assign the green: prefer one containing the centerline end, else the
    // nearest centroid within GREEN_SNAP_M.
    let assignedGreens: GeoJSONFeature[] = greens.filter((g) =>
      turf.booleanPointInPolygon(turf.point(endPos), polygonOf(g)),
    );
    if (assignedGreens.length === 0) {
      let best: { g: GeoJSONFeature; d: number } | null = null;
      for (const g of greens) {
        const c = turf.centroid(polygonOf(g));
        const d = turf.distance(turf.point(endPos), c, { units: "kilometers" }) * 1000;
        if (d <= GREEN_SNAP_M && (!best || d < best.d)) best = { g, d };
      }
      if (best) assignedGreens = [best.g];
    }
    const greenLocation = assignedGreens.length
      ? toLatLng(turf.centroid(polygonOf(assignedGreens[0])).geometry.coordinates as number[])
      : toLatLng(endPos);

    // Corridor for assigning fairways/hazards to this hole.
    const corridor = turf.buffer(line, CORRIDOR_M / 1000, { units: "kilometers" });
    const inCorridor = (f: GeoJSONFeature) => {
      try {
        return corridor ? turf.booleanIntersects(corridor, polygonOf(f)) : false;
      } catch {
        return false;
      }
    };

    const holeFairways = fairways.filter(inCorridor);
    const holeBunkers = bunkers.filter(inCorridor);
    const holeWaters = waters.filter(inCorridor);
    const holeCartPaths = cartpaths.filter((f) => {
      try {
        return corridor
          ? turf.booleanIntersects(corridor, {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: f.geometry.coordinates as GeoJSON.Position[] },
            })
          : false;
      } catch {
        return false;
      }
    });

    const hazards: HazardCarry[] = [
      ...holeBunkers.map((b) => hazardCarry(line, tee, b, "bunker" as const)),
      ...holeWaters.map((w) => hazardCarry(line, tee, w, "water" as const)),
    ]
      .filter((h): h is HazardCarry => h !== null)
      .sort((a, b) => a.carryToReachYards - b.carryToReachYards);

    const parTag = Number(holeFeature.properties.par);
    models.push({
      holeNumber: ref,
      par: Number.isInteger(parTag) && parTag >= 3 && parTag <= 6 ? parTag : parFromLength(lengthYards),
      teeLocation: tee,
      greenLocation,
      fairways: holeFairways.map(holeFeatureOf),
      bunkers: holeBunkers.map(holeFeatureOf),
      waterHazards: holeWaters.map(holeFeatureOf),
      greens: assignedGreens.map(holeFeatureOf),
      cartPaths: holeCartPaths.map((f) => f.geometry.coordinates as number[][]).map((c) => c),
      centerline: coords,
      lengthYards: Math.round(lengthYards),
      distanceToGreenYards: Math.round(
        metersToYards(
          turf.distance(turf.point([tee.lng, tee.lat]), turf.point([greenLocation.lng, greenLocation.lat]), {
            units: "kilometers",
          }) * 1000,
        ),
      ),
      hazards,
    });
  }

  models.sort((a, b) => a.holeNumber - b.holeNumber);
  return models;
}

/**
 * Carry distances for one hazard polygon: project its boundary onto the hole
 * centerline. `location` along the line ≈ yards of carry needed; min = reach
 * the near edge, max = clear the far edge. Side is the sign of the cross
 * product between the line direction and the vector to the hazard centroid.
 */
function hazardCarry(
  line: LineFeature,
  tee: LatLng,
  hazard: GeoJSONFeature,
  kind: "bunker" | "water",
): HazardCarry | null {
  const ring = (hazard.geometry.coordinates as number[][][])[0];
  if (!ring || ring.length < 4) return null;

  let minAlongKm = Infinity;
  let maxAlongKm = -Infinity;
  let minOffsetM = Infinity;

  // Sample every vertex (rings are usually small). location = km along line.
  for (const v of ring) {
    const snapped = turf.nearestPointOnLine(line, turf.point(v), { units: "kilometers" });
    const alongKm = (snapped.properties.location as number) ?? 0;
    const offsetM = ((snapped.properties.dist as number) ?? 0) * 1000;
    if (alongKm < minAlongKm) minAlongKm = alongKm;
    if (alongKm > maxAlongKm) maxAlongKm = alongKm;
    if (offsetM < minOffsetM) minOffsetM = offsetM;
  }
  if (!Number.isFinite(minAlongKm)) return null;

  // Side: compare line bearing at the hazard with bearing to its centroid.
  const centroid = turf.centroid(polygonOf(hazard));
  const snapC = turf.nearestPointOnLine(line, centroid, { units: "kilometers" });
  const atKm = Math.max(0.005, Math.min((snapC.properties.location as number) ?? 0, turf.length(line) - 0.005));
  const p1 = turf.along(line, Math.max(0, atKm - 0.005), { units: "kilometers" });
  const p2 = turf.along(line, atKm + 0.005, { units: "kilometers" });
  const lineBearing = turf.bearing(p1, p2);
  const toHazard = turf.bearing(snapC, centroid);
  let delta = toHazard - lineBearing;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;

  const offsetYards = metersToYards(minOffsetM);
  const side: HazardCarry["side"] =
    offsetYards < 8 ? "center" : delta > 0 ? "right" : "left";

  void tee;
  return {
    kind,
    carryToReachYards: Math.round(metersToYards(minAlongKm * 1000)),
    carryToClearYards: Math.round(metersToYards(maxAlongKm * 1000)),
    side,
    offsetYards: Math.round(offsetYards),
  };
}
