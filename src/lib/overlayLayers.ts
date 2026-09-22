import type { Map as MapLibreMap } from "maplibre-gl";

// Whichever of `layerIds` exists lowest in the style's layer stack is the
// right `beforeId` for inserting a new satellite-imagery raster layer below
// every currently active overlay (départements/villes from adminLayers.ts,
// world borders from worldBordersLayer.ts) — see callers in
// useCompareMaps.ts.
export function firstOverlayLayerId(map: MapLibreMap, layerIds: string[]): string | undefined {
  const layers = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    if (layerIds.includes(layer.id)) return layer.id;
  }
  return undefined;
}
