export type RenderMode = "true-color" | "false-color" | "honc" | "fire" | "swir";

// Earth Search / AWS "sentinel-cogs" asset keys each render mode needs —
// see lib/renderModes.ts for the pixel math applied to them (ported from
// the evalscripts in docs/evalscripts/).
export const RENDER_MODE_BANDS: Record<RenderMode, string[]> = {
  "true-color": ["red", "green", "blue"],
  "false-color": ["nir", "red", "green"],
  honc: ["red", "green", "blue"],
  // "scl" (Scene Classification Layer) is a standard Earth Search asset —
  // used to approximate the cloud-avoidance term the wildfire evalscript
  // originally got from a CLP (cloud probability) band, which AWS doesn't
  // provide.
  fire: ["blue", "green", "red", "swir16", "swir22", "scl"],
  // RGB = SWIR1 (B11) / NIR narrow (B8A) / Red edge 1 (B5) — issue #44: a
  // user-suggested alternative to the classic SWIR/NIR/Red (B11/B8/B4)
  // composite, picked so all three bands are natively 20m instead of mixing
  // 20m and 10m (the app's resampling already handles mixed resolutions
  // fine, as "fire" above proves, so this is a deliberate spectral choice —
  // B5 is red-edge, not visible red — not a technical necessity).
  swir: ["swir16", "nir08", "rededge1"],
};

export const DEFAULT_MAX_CLOUD = 30;
// Kept small on purpose: the scene-search query's latency scales with
// the size of this window (more candidate days = more rows to filter/sort
// server-side, see lib/earthSearch.ts), and Sentinel-2's ~5-day revisit time
// means ±14 days almost always finds a match anyway. Still user-adjustable
// via "Paramètres avancés" for sparser-coverage searches.
export const DEFAULT_WINDOW_DAYS = 14;
