import { useEffect, useRef } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";

const OSM_STYLE = {
  version: 8 as const,
  // Needed for the "départements"/"villes" overlay labels (lib/adminLayers.ts)
  // — MapLibre refuses any symbol layer's text-field without a glyphs URL,
  // even on a style that's otherwise pure raster tiles.
  glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
};

interface InitialView {
  center: [number, number];
  zoom: number;
}

/**
 * Owns the single "browsing" MapLibre instance (hidden while a compare view
 * is open). Created once on mount; `containerRef` must be attached to an
 * always-mounted div (never conditionally rendered — MapLibre needs a real
 * DOM node at construction time).
 */
export function useBaseMap(initialView: InitialView, onLoad?: (map: MapLibreMap) => void, onMoveEnd?: (map: MapLibreMap) => void) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // The map itself is only ever constructed once, on mount (see below), but
  // `onMoveEnd` closes over live App state (current dates/mode) that changes
  // on every render — a ref keeps the "moveend" listener (attached once)
  // always calling the *latest* version instead of the one captured at
  // construction time.
  const onMoveEndRef = useRef(onMoveEnd);
  onMoveEndRef.current = onMoveEnd;

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: initialView.center,
      zoom: initialView.zoom,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;
    if (onLoad) map.on("load", () => onLoad(map));
    map.on("moveend", () => onMoveEndRef.current?.(map));

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Only ever constructed once, on mount — initialView/onLoad are read at
    // construction time only (matches the original app.js, which built the
    // base map exactly once from the initial URL params).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { containerRef, mapRef };
}
