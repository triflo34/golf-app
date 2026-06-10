import type { CourseGeo, GeoJSONFeatureCollection, HoleData } from "./types";

/**
 * Demo fixture: a realistic 396-yard par 4 with a soft dogleg right, a bunker
 * complex on the right at driver range, and water guarding the green's left.
 *
 * Exists so the strategy map is fully demonstrable with zero network access —
 * OSM coverage varies and some deployments block egress; the UI offers this
 * when live data isn't available. Coordinates are synthetic (placed over a
 * field near Southfield, MI) and generated from meter offsets at module load.
 */

const ORIGIN = { lat: 42.4605, lng: -83.2643 }; // tee
const M_PER_DEG_LAT = 111_320;
const mPerDegLng = M_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180);

/** Offset in meters (x = east, y = north) → [lng, lat]. */
function p(x: number, y: number): number[] {
  return [ORIGIN.lng + x / mPerDegLng, ORIGIN.lat + y / M_PER_DEG_LAT];
}

const YD = 0.9144; // meters per yard

// Centerline: straight for 240yd, then bends ~15° right to the green at 396yd.
const centerline = [
  p(0, 0),
  p(2 * YD, 80 * YD),
  p(4 * YD, 160 * YD),
  p(8 * YD, 240 * YD),
  p(26 * YD, 310 * YD),
  p(46 * YD, 372 * YD),
  p(54 * YD, 396 * YD),
];

const tee = { lat: centerline[0][1], lng: centerline[0][0] };
const greenCenter = { lat: centerline[6][1], lng: centerline[6][0] };

function ring(points: number[][]): number[][][] {
  return [[...points, points[0]]];
}

// Fairway: ~34yd-wide corridor from 40yd to 360yd following the bend.
const fairway = ring([
  p(-17 * YD, 40 * YD), p(17 * YD, 40 * YD),
  p(20 * YD, 160 * YD), p(24 * YD, 240 * YD),
  p(44 * YD, 310 * YD), p(58 * YD, 352 * YD),
  p(30 * YD, 366 * YD), p(12 * YD, 318 * YD),
  p(-10 * YD, 246 * YD), p(-14 * YD, 160 * YD),
]);

// Bunker complex right, in the driver window (carry ~218yd, clear ~252yd).
const bunkerA = ring([
  p(22 * YD, 218 * YD), p(36 * YD, 224 * YD), p(38 * YD, 240 * YD), p(24 * YD, 238 * YD),
]);
const bunkerB = ring([
  p(28 * YD, 240 * YD), p(42 * YD, 246 * YD), p(40 * YD, 252 * YD), p(27 * YD, 250 * YD),
]);
// Greenside bunker short-right.
const bunkerC = ring([
  p(58 * YD, 368 * YD), p(68 * YD, 372 * YD), p(66 * YD, 382 * YD), p(56 * YD, 378 * YD),
]);
// Water left of the green from 330yd.
const water = ring([
  p(8 * YD, 330 * YD), p(28 * YD, 366 * YD), p(34 * YD, 398 * YD),
  p(12 * YD, 404 * YD), p(-6 * YD, 360 * YD),
]);
// Green: oval ~28yd deep.
const green = ring([
  p(44 * YD, 384 * YD), p(58 * YD, 382 * YD), p(66 * YD, 392 * YD),
  p(62 * YD, 406 * YD), p(48 * YD, 410 * YD), p(40 * YD, 398 * YD),
]);
// Cart path along the right.
const cartpath = [
  p(30 * YD, 0), p(34 * YD, 120 * YD), p(40 * YD, 240 * YD), p(70 * YD, 330 * YD), p(76 * YD, 396 * YD),
];

export const DEMO_HOLE: HoleData = {
  holeNumber: 1,
  par: 4,
  teeLocation: tee,
  greenLocation: greenCenter,
  fairways: [{ coordinates: fairway }],
  bunkers: [{ coordinates: bunkerA }, { coordinates: bunkerB }, { coordinates: bunkerC }],
  waterHazards: [{ coordinates: water }],
  greens: [{ coordinates: green }],
  cartPaths: [cartpath],
  centerline,
  lengthYards: 396,
  distanceToGreenYards: 396,
  hazards: [
    { kind: "bunker", carryToReachYards: 218, carryToClearYards: 252, side: "right", offsetYards: 18 },
    { kind: "water", carryToReachYards: 330, carryToClearYards: 404, side: "left", offsetYards: 12 },
    { kind: "bunker", carryToReachYards: 368, carryToClearYards: 382, side: "right", offsetYards: 14 },
  ],
};

const geojson: GeoJSONFeatureCollection = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { kind: "fairway" }, geometry: { type: "Polygon", coordinates: fairway } },
    { type: "Feature", properties: { kind: "green" }, geometry: { type: "Polygon", coordinates: green } },
    { type: "Feature", properties: { kind: "bunker" }, geometry: { type: "Polygon", coordinates: bunkerA } },
    { type: "Feature", properties: { kind: "bunker" }, geometry: { type: "Polygon", coordinates: bunkerB } },
    { type: "Feature", properties: { kind: "bunker" }, geometry: { type: "Polygon", coordinates: bunkerC } },
    { type: "Feature", properties: { kind: "water" }, geometry: { type: "Polygon", coordinates: water } },
    { type: "Feature", properties: { kind: "cartpath" }, geometry: { type: "LineString", coordinates: cartpath } },
    { type: "Feature", properties: { kind: "hole", ref: "1", par: "4" }, geometry: { type: "LineString", coordinates: centerline } },
  ],
};

export const DEMO_COURSE_GEO: CourseGeo = {
  center: tee,
  availableHoles: [1],
  holes: [DEMO_HOLE],
  geojson,
  source: "fixture",
  fetchedAt: new Date(0).toISOString(),
};
