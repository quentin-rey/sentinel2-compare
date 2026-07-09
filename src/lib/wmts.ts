import { SH_INSTANCE_ID, MODE_LAYERS, type RenderMode } from "./config";

export const SH_WMTS_BASE = `https://sh.dataspace.copernicus.eu/ogc/wmts/${SH_INSTANCE_ID}`;

export interface WmtsTileOptions {
  maxCloud?: number;
  priority?: "mostRecent" | "leastCC";
}

/**
 * Builds a MapLibre raster tile URL template for a Sentinel-2 WMTS layer.
 *
 * `timeRange` must be an explicit ISO8601 range string ("start/end").
 * Callers resolve which date to request via stacInfo.loadSceneData() first
 * and pass that exact day back in here, so the tiles rendered always match
 * the date/cloud-cover reported to the user (previously this function
 * picked its own wide +/-30 day window with PRIORITY=leastCC, which could
 * silently render a completely different day than the one requested/shown).
 *
 * `maxCloud` should be set to 100 (i.e. no filtering) when the caller
 * already resolved an exact single-day range — otherwise Sentinel Hub's own
 * MAXCC filter can still blank out that day server-side (e.g. a smoky
 * wildfire scene).
 */
export function wmtsTileUrl(
  mode: RenderMode,
  timeRange: string,
  { maxCloud = 100, priority = "mostRecent" }: WmtsTileOptions = {},
): string {
  const layer = MODE_LAYERS[mode];
  if (!layer) throw new Error(`Mode de rendu inconnu: ${mode}`);

  const params = new URLSearchParams({
    SERVICE: "WMTS",
    REQUEST: "GetTile",
    VERSION: "1.0.0",
    LAYER: layer,
    STYLE: "default",
    TILEMATRIXSET: "PopularWebMercator256",
    FORMAT: "image/png",
    TIME: timeRange,
    MAXCC: String(maxCloud),
    PRIORITY: priority,
    SHOWLOGO: "false",
  });

  // {z}/{x}/{y} are substituted per-tile by MapLibre itself.
  return `${SH_WMTS_BASE}?${params.toString()}&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
}

// Single UTC calendar day range, e.g. for a date resolved via STAC metadata.
export function dayRange(isoDateTime: string): string {
  const day = isoDateTime.slice(0, 10);
  return `${day}T00:00:00Z/${day}T23:59:59Z`;
}
