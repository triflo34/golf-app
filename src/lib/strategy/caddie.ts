import type { HoleData, LandingZone, LatLng, PlayerProfile, StrategyResult } from "./types";

/**
 * AI caddie — deterministic strategy engine.
 *
 * Free by design: pure TypeScript over the hole geometry, no LLM/API cost,
 * same output every time (testable). The signature matches the spec —
 * generateStrategy(holeData, playerProfile) — so a provider that produces the
 * prose with an LLM can be swapped in behind the same interface later.
 */

/** Stock carry distances for a 250-yard driver; scaled by the player's drive. */
const CLUB_CARRIES: [string, number][] = [
  ["Driver", 250],
  ["3-wood", 225],
  ["5-wood", 210],
  ["4-iron", 195],
  ["5-iron", 185],
  ["6-iron", 175],
  ["7-iron", 162],
  ["8-iron", 150],
  ["9-iron", 138],
  ["Pitching wedge", 122],
  ["Gap wedge", 105],
  ["Sand wedge", 90],
  ["Lob wedge", 70],
];

/** Pick the club whose scaled carry best matches the target yardage. */
export function clubForYardage(yards: number, averageDriveDistance: number): string {
  const scale = averageDriveDistance / 250;
  let best = CLUB_CARRIES[CLUB_CARRIES.length - 1][0];
  let bestDiff = Infinity;
  for (const [club, carry] of CLUB_CARRIES) {
    const scaled = carry * scale;
    const diff = Math.abs(scaled - yards);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = club;
    }
  }
  return best;
}

/** Point along the centerline at `yards` from the tee (planar approximation
 *  is avoided — the caller passes a centerline in [lng,lat] and we walk it). */
export function pointAlongCenterline(centerline: number[][], yards: number): LatLng {
  const meters = yards / 1.0936133;
  let remaining = meters;
  for (let i = 1; i < centerline.length; i++) {
    const [lng1, lat1] = centerline[i - 1];
    const [lng2, lat2] = centerline[i];
    const seg = haversineM(lat1, lng1, lat2, lng2);
    if (seg >= remaining && seg > 0) {
      const t = remaining / seg;
      return { lat: lat1 + (lat2 - lat1) * t, lng: lng1 + (lng2 - lng1) * t };
    }
    remaining -= seg;
  }
  const last = centerline[centerline.length - 1];
  return { lat: last[1], lng: last[0] };
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function sideLabel(side: "left" | "right" | "center"): string {
  return side === "center" ? "in the line of play" : `on the ${side}`;
}

export function generateStrategy(holeData: HoleData, playerProfile: PlayerProfile): StrategyResult {
  const drive = Math.max(120, Math.min(playerProfile.averageDriveDistance || 230, 350));
  const { par, lengthYards, hazards } = holeData;

  // Par 3: one swing — club straight off the yardage.
  if (par === 3) {
    const club = clubForYardage(holeData.distanceToGreenYards, drive);
    const inPlay = hazards.filter((h) => h.carryToClearYards >= holeData.distanceToGreenYards - 40);
    const dangerAreas = inPlay.map(
      (h) => `${h.kind === "water" ? "Water" : "Bunker"} ${sideLabel(h.side)}, ${h.carryToReachYards}y to reach / ${h.carryToClearYards}y to clear`,
    );
    const guard = inPlay[0];
    const strategy =
      `${holeData.distanceToGreenYards} yards to the center of the green — ${club}.` +
      (guard
        ? ` ${guard.kind === "water" ? "Water" : "A bunker"} guards the green ${sideLabel(guard.side)}; favor the ${guard.side === "left" ? "right" : guard.side === "right" ? "left" : "center, taking enough club"} side.`
        : " No serious trouble — fire at the middle of the green.");
    return {
      strategy,
      dangerAreas,
      recommendedPlay: `${club} to the center of the green`,
      teeClub: club,
      approachClub: null,
      landingZone: null,
    };
  }

  // Par 4/5: pick the tee club. Default driver; club down when a hazard sits
  // squarely in the driver landing window and can't be carried.
  let teeYards = Math.min(drive, Math.max(lengthYards - 80, drive * 0.6));
  let teeClub = "Driver";
  const window = (y: number) => hazards.filter(
    (h) =>
      h.offsetYards < 35 &&
      h.carryToReachYards <= y + 12 &&
      h.carryToClearYards >= y - 25,
  );
  const driverTrouble = window(teeYards).filter((h) => h.carryToClearYards > drive + 5);
  if (driverTrouble.length > 0) {
    const shortOf = Math.min(...driverTrouble.map((h) => h.carryToReachYards)) - 15;
    if (shortOf > drive * 0.55) {
      teeYards = shortOf;
      teeClub = clubForYardage(shortOf, drive);
    }
  }

  const landingCenter = pointAlongCenterline(holeData.centerline, teeYards);
  const remainingYards = Math.max(0, Math.round(lengthYards - teeYards));
  // Dispersion grows with distance: ~7% of the shot, floor of 15 yards.
  const radiusYards = Math.round(Math.max(15, teeYards * 0.07));
  const landingZone: LandingZone = { center: landingCenter, radiusYards, remainingYards };

  const approachClub = remainingYards > 0 ? clubForYardage(remainingYards, drive) : null;

  // Danger list: anything reachable from the tee shot's window, plus
  // green-side trouble for the approach.
  const teeDanger = window(teeYards);
  const greenside = hazards.filter(
    (h) => h.carryToClearYards >= lengthYards - 45 && !teeDanger.includes(h),
  );
  const dangerAreas = [
    ...teeDanger.map(
      (h) =>
        `${h.kind === "water" ? "Water" : "Bunker"} ${sideLabel(h.side)} at ${h.carryToReachYards}–${h.carryToClearYards}y off the tee`,
    ),
    ...greenside.map(
      (h) => `Greenside ${h.kind === "water" ? "water" : "bunker"} ${sideLabel(h.side)}`,
    ),
  ];

  // Favor the side away from the most-threatening tee hazard.
  const biggest = [...teeDanger].sort((a, b) =>
    a.kind === b.kind ? a.offsetYards - b.offsetYards : a.kind === "water" ? -1 : 1,
  )[0];
  const favor =
    biggest && biggest.side !== "center"
      ? ` Favor the ${biggest.side === "left" ? "right" : "left"} side of the fairway to avoid the ${biggest.kind === "water" ? "water" : "bunker"}${teeDanger.length > 1 ? " complex" : ""} on the ${biggest.side}.`
      : "";

  const layupNote =
    teeClub !== "Driver"
      ? ` Laying back with ${teeClub} keeps you short of trouble at ${Math.round(teeYards)} yards.`
      : "";

  const approachPhrase = approachClub
    ? ` — about ${/^[85]/.test(approachClub) ? "an" : "a"} ${approachClub.toLowerCase()} in`
    : "";
  const strategy =
    `${teeClub} leaves approximately ${remainingYards} yards to the center of the green` +
    `${approachPhrase}.${favor}${layupNote}` +
    (par === 5 && remainingYards > drive * 0.95
      ? " Three honest shots: position off the tee, lay up to your favorite wedge number, attack the pin."
      : "");

  return {
    strategy,
    dangerAreas,
    recommendedPlay:
      `${teeClub} off the tee${favor ? ` favoring the ${biggest!.side === "left" ? "right" : "left"} side` : ""}, then ${approachClub ?? "a short pitch"} to the green`,
    teeClub,
    approachClub,
    landingZone,
  };
}
