"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as turf from "@turf/turf";
import type { HoleData, StrategyResult } from "@/lib/strategy/types";
import { buildDistanceArcs, buildHoleFeatures, buildStrategyOverlay } from "@/lib/strategy/overlays";

/**
 * Hole strategy map (MapLibre GL JS — open source, no token).
 *
 * Free imagery: Esri World Imagery raster tiles (free with the attribution
 * shown on the map); glyphs from the MapLibre demo glyph server. The map is
 * rotated so the hole plays bottom→top like premium golf GPS apps, with
 * distance arcs that follow the centerline.
 */

const SATELLITE_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ATTRIBUTION = "Imagery © Esri, Maxar, Earthstar Geographics | Map data © OpenStreetMap contributors";
const GLYPHS = "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";
const FONT = ["Open Sans Semibold"];

type Props = {
  hole: HoleData;
  strategy: StrategyResult | null;
  className?: string;
};

export function HoleStrategyMap({ hole, strategy, className = "" }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        glyphs: GLYPHS,
        sources: {
          satellite: {
            type: "raster",
            tiles: [SATELLITE_TILES],
            tileSize: 256,
            maxzoom: 19,
            attribution: ATTRIBUTION,
          },
        },
        layers: [{ id: "satellite", type: "raster", source: "satellite" }],
      },
      center: [hole.teeLocation.lng, hole.teeLocation.lat],
      zoom: 16,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showZoom: true }), "top-right");

    map.on("load", () => {
      map.addSource("hole", { type: "geojson", data: buildHoleFeatures(hole) as GeoJSON.FeatureCollection });
      map.addSource("arcs", { type: "geojson", data: buildDistanceArcs(hole) as GeoJSON.FeatureCollection });
      map.addSource("strategy", {
        type: "geojson",
        data: buildStrategyOverlay(hole, strategy?.landingZone ?? null) as GeoJSON.FeatureCollection,
      });

      // --- course features ---
      map.addLayer({
        id: "fairway", type: "fill", source: "hole",
        filter: ["==", ["get", "kind"], "fairway"],
        paint: { "fill-color": "#4caf50", "fill-opacity": 0.22 },
      });
      map.addLayer({
        id: "green", type: "fill", source: "hole",
        filter: ["==", ["get", "kind"], "green"],
        paint: { "fill-color": "#8bc34a", "fill-opacity": 0.4 },
      });
      map.addLayer({
        id: "green-line", type: "line", source: "hole",
        filter: ["==", ["get", "kind"], "green"],
        paint: { "line-color": "#c5e1a5", "line-width": 1.5 },
      });
      map.addLayer({
        id: "bunker", type: "fill", source: "hole",
        filter: ["==", ["get", "kind"], "bunker"],
        paint: { "fill-color": "#f0e2b6", "fill-opacity": 0.85 },
      });
      map.addLayer({
        id: "water", type: "fill", source: "hole",
        filter: ["==", ["get", "kind"], "water"],
        paint: { "fill-color": "#3d85c6", "fill-opacity": 0.55 },
      });
      map.addLayer({
        id: "cartpath", type: "line", source: "hole",
        filter: ["==", ["get", "kind"], "cartpath"],
        paint: { "line-color": "#cfcfcf", "line-width": 1.2, "line-dasharray": [2, 2], "line-opacity": 0.7 },
      });
      map.addLayer({
        id: "centerline", type: "line", source: "hole",
        filter: ["==", ["get", "kind"], "centerline"],
        paint: { "line-color": "#ffffff", "line-width": 1, "line-dasharray": [1, 3], "line-opacity": 0.5 },
      });

      // --- distance arcs ---
      map.addLayer({
        id: "arc-lines", type: "line", source: "arcs",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": "#ffffff", "line-width": 1.4, "line-opacity": 0.85 },
      });
      map.addLayer({
        id: "arc-labels", type: "symbol", source: "arcs",
        filter: ["==", ["get", "isLabel"], true],
        layout: { "text-field": ["get", "label"], "text-font": FONT, "text-size": 12, "text-allow-overlap": true },
        paint: { "text-color": "#ffffff", "text-halo-color": "#000000", "text-halo-width": 1.2 },
      });

      // --- strategy overlay ---
      map.addLayer({
        id: "landing-zone", type: "fill", source: "strategy",
        filter: ["==", ["get", "role"], "landing-zone"],
        paint: { "fill-color": "#d4af37", "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: "landing-zone-line", type: "line", source: "strategy",
        filter: ["==", ["get", "role"], "landing-zone"],
        paint: { "line-color": "#f0d977", "line-width": 2 },
      });
      map.addLayer({
        id: "shot-line", type: "line", source: "strategy",
        filter: ["==", ["get", "role"], "shot-line"],
        paint: {
          "line-color": "#f0d977",
          "line-width": 2.5,
          "line-dasharray": [1.5, 1.5],
          "line-opacity": 0.95,
        },
      });
      map.addLayer({
        id: "tee-marker", type: "circle", source: "strategy",
        filter: ["==", ["get", "role"], "tee-marker"],
        paint: { "circle-radius": 6, "circle-color": "#ffffff", "circle-stroke-color": "#1a2e1a", "circle-stroke-width": 2 },
      });
      map.addLayer({
        id: "green-marker", type: "circle", source: "strategy",
        filter: ["==", ["get", "role"], "green-marker"],
        paint: { "circle-radius": 6, "circle-color": "#d4af37", "circle-stroke-color": "#1a2e1a", "circle-stroke-width": 2 },
      });
      map.addLayer({
        id: "strategy-labels", type: "symbol", source: "strategy",
        filter: ["has", "label"],
        layout: {
          "text-field": ["get", "label"],
          "text-font": FONT,
          "text-size": 12,
          "text-offset": [0, -1.4],
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#f0d977", "text-halo-color": "#000000", "text-halo-width": 1.3 },
      });

      frameHole(map, hole);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // The map is rebuilt when the hole changes; strategy-only changes are
    // handled by the cheaper effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hole]);

  // Update only the strategy overlay when the drive distance changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("strategy") as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(buildStrategyOverlay(hole, strategy?.landingZone ?? null) as GeoJSON.FeatureCollection);
  }, [hole, strategy]);

  return <div ref={containerRef} className={`h-full w-full ${className}`} />;
}

/** Frame the hole tee→green, rotated so the hole plays bottom→top. */
function frameHole(map: maplibregl.Map, hole: HoleData) {
  const tee = turf.point([hole.teeLocation.lng, hole.teeLocation.lat]);
  const green = turf.point([hole.greenLocation.lng, hole.greenLocation.lat]);
  const bearing = turf.bearing(tee, green);

  const all = turf.featureCollection([
    ...(buildHoleFeatures(hole).features as GeoJSON.Feature[]),
  ]);
  const [minX, minY, maxX, maxY] = turf.bbox(all);
  map.fitBounds(
    [
      [minX, minY],
      [maxX, maxY],
    ],
    { padding: 42, bearing, pitch: 0, duration: 0 },
  );
}
