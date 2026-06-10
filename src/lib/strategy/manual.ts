import * as turf from "@turf/turf";
import type { HoleData, LatLng } from "./types";
import { metersToYards } from "./types";
import { parFromLength } from "./hole-model";

/**
 * Manual hole geometry — the primary data path.
 *
 * Local OSM coverage proved too thin (and public Overpass rate-limits), so
 * holes are set up in-app instead: two taps on the satellite editor (tee +
 * green) stored in course_hole_geo. This builds a full HoleData from those two
 * points — straight centerline, computed length, par from course_holes when
 * known — which lights up arcs, landing zone, and the caddie everywhere.
 */

export type ManualHoleRow = {
  hole_number: number;
  tee_lat: number;
  tee_lng: number;
  green_lat: number;
  green_lng: number;
  hazards: unknown;
};

export function buildManualHoleData(row: ManualHoleRow, parFromDb: number | null): HoleData {
  const tee: LatLng = { lat: row.tee_lat, lng: row.tee_lng };
  const green: LatLng = { lat: row.green_lat, lng: row.green_lng };
  const distM =
    turf.distance(turf.point([tee.lng, tee.lat]), turf.point([green.lng, green.lat]), {
      units: "kilometers",
    }) * 1000;
  const lengthYards = Math.round(metersToYards(distM));

  return {
    holeNumber: row.hole_number,
    par: parFromDb ?? parFromLength(lengthYards),
    teeLocation: tee,
    greenLocation: green,
    fairways: [],
    bunkers: [],
    waterHazards: [],
    greens: [],
    cartPaths: [],
    centerline: [
      [tee.lng, tee.lat],
      [green.lng, green.lat],
    ],
    lengthYards,
    distanceToGreenYards: lengthYards,
    hazards: [],
  };
}
