/**
 * Golf hole strategy system — shared types.
 *
 * Everything in this module is deliberately free-tier:
 *  - course geometry from OpenStreetMap via the Overpass API (free)
 *  - satellite imagery from Esri World Imagery tiles (free with attribution)
 *  - rendering via MapLibre GL JS + Turf.js (open source)
 *  - the caddie is a deterministic engine (no LLM/API cost), but
 *    generateStrategy() is interface-compatible with an LLM drop-in later.
 */

export type LatLng = { lat: number; lng: number };

/** [lng, lat] ring(s) — GeoJSON Polygon coordinates. */
export type PolygonCoords = number[][][];

export type HoleFeature = {
  /** GeoJSON Polygon coordinates ([lng,lat] rings). */
  coordinates: PolygonCoords;
  /** OSM way id, for debugging / dedupe. */
  osmId?: number;
};

export type HoleData = {
  holeNumber: number;
  par: number;
  teeLocation: LatLng;
  greenLocation: LatLng;
  fairways: HoleFeature[];
  bunkers: HoleFeature[];
  waterHazards: HoleFeature[];
  /** Greens assigned to this hole (usually 1). */
  greens: HoleFeature[];
  /** Cart path segments near this hole, when OSM has them. [lng,lat][] lines */
  cartPaths: number[][][];
  /** Tee→green path. From the OSM golf=hole way when mapped, else straight. */
  centerline: number[][]; // [lng,lat][]
  /** Total hole length along the centerline, in yards. */
  lengthYards: number;
  /** Straight-line tee→green distance, in yards. */
  distanceToGreenYards: number;
  /** Carry distances from the tee to each hazard near the playing corridor. */
  hazards: HazardCarry[];
};

export type HazardKind = "bunker" | "water";

export type HazardCarry = {
  kind: HazardKind;
  /** Yards from tee (along the line of play) to reach the near edge. */
  carryToReachYards: number;
  /** Yards from tee needed to fly the far edge. */
  carryToClearYards: number;
  /** Which side of the centerline the hazard sits on. */
  side: "left" | "right" | "center";
  /** Distance from the centerline to the hazard's nearest point, yards. */
  offsetYards: number;
};

export type PlayerProfile = {
  averageDriveDistance: number; // yards
};

export type LandingZone = {
  center: LatLng;
  /** Dispersion radius in yards (grows with drive distance). */
  radiusYards: number;
  /** Yards from the landing zone center to the green center. */
  remainingYards: number;
};

export type StrategyResult = {
  strategy: string;
  dangerAreas: string[];
  recommendedPlay: string;
  /** Club for the tee shot + expected approach club. */
  teeClub: string;
  approachClub: string | null;
  landingZone: LandingZone | null;
};

/** Normalized whole-course extraction returned by the Overpass service. */
export type CourseGeo = {
  /** Course center used for the query. */
  center: LatLng;
  /** Hole numbers OSM has golf=hole centerlines for. */
  availableHoles: number[];
  holes: HoleData[];
  /** Raw normalized FeatureCollection (all course features, hole-agnostic). */
  geojson: GeoJSONFeatureCollection;
  source: "overpass" | "cache" | "fixture" | "manual";
  fetchedAt: string;
};

export type GeoJSONFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: "Polygon" | "LineString" | "Point";
    coordinates: unknown;
  };
};

export type GeoJSONFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
};

export const YARDS_PER_METER = 1.0936133;

export function metersToYards(m: number): number {
  return m * YARDS_PER_METER;
}

export function yardsToMeters(y: number): number {
  return y / YARDS_PER_METER;
}
