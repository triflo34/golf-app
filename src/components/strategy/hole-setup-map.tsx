"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LatLng } from "@/lib/strategy/types";

/**
 * Two-tap hole setup editor: tap the tee, tap the green, save. This is the
 * primary way holes get strategy data (OSM coverage is thin locally and the
 * free Overpass endpoints rate-limit). Satellite imagery is the free Esri
 * World Imagery tile set.
 */

const SATELLITE_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ATTRIBUTION = "Imagery © Esri, Maxar, Earthstar Geographics";

type Props = {
  /** Where to open the map: prior hole data, course coords, or null (US). */
  initialCenter: LatLng | null;
  initialZoom?: number;
  holeNumber: number;
  saving: boolean;
  onSave: (tee: LatLng, green: LatLng) => void;
  onCancel: () => void;
};

export function HoleSetupMap({
  initialCenter,
  initialZoom = 16,
  holeNumber,
  saving,
  onSave,
  onCancel,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const teeMarker = useRef<maplibregl.Marker | null>(null);
  const greenMarker = useRef<maplibregl.Marker | null>(null);
  const [tee, setTee] = useState<LatLng | null>(null);
  const [green, setGreen] = useState<LatLng | null>(null);
  // Refs mirror state for the map click handler (registered once).
  const teeRef = useRef<LatLng | null>(null);
  const greenRef = useRef<LatLng | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
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
      center: initialCenter ? [initialCenter.lng, initialCenter.lat] : [-95, 39],
      zoom: initialCenter ? initialZoom : 4,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showZoom: true }), "top-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }),
      "top-right",
    );

    map.on("click", (e) => {
      const p = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      if (!teeRef.current) {
        teeRef.current = p;
        setTee(p);
        teeMarker.current?.remove();
        teeMarker.current = new maplibregl.Marker({ color: "#ffffff" })
          .setLngLat([p.lng, p.lat])
          .addTo(map);
      } else if (!greenRef.current) {
        greenRef.current = p;
        setGreen(p);
        greenMarker.current?.remove();
        greenMarker.current = new maplibregl.Marker({ color: "#d4af37" })
          .setLngLat([p.lng, p.lat])
          .addTo(map);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Rebuild only per hole — initialCenter changes shouldn't rip the map down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holeNumber]);

  function reset() {
    teeRef.current = null;
    greenRef.current = null;
    setTee(null);
    setGreen(null);
    teeMarker.current?.remove();
    greenMarker.current?.remove();
    teeMarker.current = null;
    greenMarker.current = null;
  }

  const step = !tee ? `Tap the TEE for hole ${holeNumber}` : !green ? "Now tap the GREEN" : "Looks good?";

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-2">
        <span className="rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">
          {step}
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 p-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-black/70 px-3 py-2 text-xs font-semibold text-white"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={!tee}
          className="rounded-lg bg-black/70 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          Re-place
        </button>
        <button
          type="button"
          onClick={() => tee && green && onSave(tee, green)}
          disabled={!tee || !green || saving}
          className="rounded-lg bg-[#d4af37] px-4 py-2 text-xs font-bold text-[#1a2e1a] disabled:opacity-40"
        >
          {saving ? "Saving…" : `Save hole ${holeNumber}`}
        </button>
      </div>
    </div>
  );
}
