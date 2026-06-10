import * as turf from "@turf/turf";
import type { GeoJSONFeature, GeoJSONFeatureCollection, HoleData, LandingZone } from "./types";
import { yardsToMeters } from "./types";

/**
 * Map overlay builders (client-safe). Produce GeoJSON for MapLibre layers:
 * distance arcs that bend around the tee following the hole centerline,
 * the landing-zone circle, and the recommended shot line — the look of
 * premium golf GPS apps (Arccos/Golfshot style).
 */

export const ARC_YARDAGES = [100, 150, 200, 250, 300];

type Line = GeoJSON.Feature<GeoJSON.LineString>;

function centerlineFeature(hole: HoleData): Line {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: hole.centerline as GeoJSON.Position[] },
  };
}

/**
 * Distance arcs: for each yardage Y (within the hole length), draw an arc of
 * radius Y centered on the TEE, swept ±38° around the centerline's bearing at
 * that distance. Because the sweep is centered on the local centerline
 * direction, arcs "follow" doglegs the way Golfshot renders them.
 */
export function buildDistanceArcs(hole: HoleData): GeoJSONFeatureCollection {
  const line = centerlineFeature(hole);
  const lineLenKm = turf.length(line, { units: "kilometers" });
  const tee = turf.point([hole.teeLocation.lng, hole.teeLocation.lat]);
  const features: GeoJSONFeature[] = [];

  for (const yards of ARC_YARDAGES) {
    const km = yardsToMeters(yards) / 1000;
    if (km > lineLenKm - 0.015) continue; // skip arcs at/past the green

    const at = turf.along(line, km, { units: "kilometers" });
    const bearingToArc = turf.bearing(tee, at);

    const positions: GeoJSON.Position[] = [];
    for (let a = -38; a <= 38; a += 4) {
      const p = turf.destination(tee, km, bearingToArc + a, { units: "kilometers" });
      positions.push(p.geometry.coordinates as GeoJSON.Position);
    }
    features.push({
      type: "Feature",
      properties: { yards, label: `${yards}` },
      geometry: { type: "LineString", coordinates: positions },
    });
    // Label anchor: just left of the arc's end so text doesn't sit on the line.
    const labelPoint = turf.destination(tee, km, bearingToArc - 41, { units: "kilometers" });
    features.push({
      type: "Feature",
      properties: { yards, label: `${yards}`, isLabel: true },
      geometry: { type: "Point", coordinates: labelPoint.geometry.coordinates },
    });
  }

  return { type: "FeatureCollection", features };
}

/** Landing-zone circle + recommended shot lines (tee→zone→green). */
export function buildStrategyOverlay(
  hole: HoleData,
  landingZone: LandingZone | null,
): GeoJSONFeatureCollection {
  const features: GeoJSONFeature[] = [];
  const tee: GeoJSON.Position = [hole.teeLocation.lng, hole.teeLocation.lat];
  const green: GeoJSON.Position = [hole.greenLocation.lng, hole.greenLocation.lat];

  if (landingZone) {
    const center: GeoJSON.Position = [landingZone.center.lng, landingZone.center.lat];
    const circle = turf.circle(center, yardsToMeters(landingZone.radiusYards) / 1000, {
      steps: 48,
      units: "kilometers",
    });
    features.push({
      type: "Feature",
      properties: { role: "landing-zone" },
      geometry: circle.geometry as GeoJSONFeature["geometry"],
    });
    features.push({
      type: "Feature",
      properties: { role: "shot-line", segment: "tee" },
      geometry: { type: "LineString", coordinates: [tee, center] },
    });
    features.push({
      type: "Feature",
      properties: { role: "shot-line", segment: "approach" },
      geometry: { type: "LineString", coordinates: [center, green] },
    });
    features.push({
      type: "Feature",
      properties: {
        role: "distance-label",
        label: `${landingZone.remainingYards}y in`,
      },
      geometry: { type: "Point", coordinates: center },
    });
  } else {
    // Par 3 — single shot line.
    features.push({
      type: "Feature",
      properties: { role: "shot-line", segment: "tee" },
      geometry: { type: "LineString", coordinates: [tee, green] },
    });
  }

  features.push({
    type: "Feature",
    properties: { role: "tee-marker", label: "TEE" },
    geometry: { type: "Point", coordinates: tee },
  });
  features.push({
    type: "Feature",
    properties: { role: "green-marker", label: `${hole.distanceToGreenYards}y` },
    geometry: { type: "Point", coordinates: green },
  });

  return { type: "FeatureCollection", features };
}

/** Per-hole course features (fairway/green/bunker/water/cartpath) as one FC. */
export function buildHoleFeatures(hole: HoleData): GeoJSONFeatureCollection {
  const features: GeoJSONFeature[] = [];
  const push = (kind: string, coordinates: unknown, type: "Polygon" | "LineString") =>
    features.push({ type: "Feature", properties: { kind }, geometry: { type, coordinates } });

  for (const f of hole.fairways) push("fairway", f.coordinates, "Polygon");
  for (const f of hole.greens) push("green", f.coordinates, "Polygon");
  for (const f of hole.bunkers) push("bunker", f.coordinates, "Polygon");
  for (const f of hole.waterHazards) push("water", f.coordinates, "Polygon");
  for (const c of hole.cartPaths) push("cartpath", c, "LineString");
  push("centerline", hole.centerline, "LineString");

  return { type: "FeatureCollection", features };
}
