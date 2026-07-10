// Instance ID from your Copernicus Data Space Ecosystem "Configuration Utility"
// (https://shapps.dataspace.copernicus.eu/dashboard/#/configurations).
// Public by design (embedded in the frontend) — it identifies your quota, not a secret.
export const SH_INSTANCE_ID = "fec3f31d-086f-4d6e-af7c-cc751e1a3557";

export type RenderMode = "true-color" | "false-color" | "honc" | "fire";

// Must match the Layer IDs created in the CDSE configuration.
export const MODE_LAYERS: Record<RenderMode, string> = {
  "true-color": "TRUE-COLOR",
  "false-color": "FALSE-COLOR",
  honc: "TCO-L2A", // HONC contrast/gamma/saturation script, pasted into the L2A "TCO" layer (see README)
  fire: "WILDFIRE", // QuickFire script by Pierre Markuse, pasted into this layer (see README)
};

export const DEFAULT_MAX_CLOUD = 30;
// Kept small on purpose: the CDSE scene-search query's latency scales with
// the size of this window (more candidate days = more rows to filter/sort
// server-side, see lib/stacInfo.ts), and Sentinel-2's ~5-day revisit time
// means ±14 days almost always finds a match anyway. Still user-adjustable
// via "Paramètres avancés" for sparser-coverage searches.
export const DEFAULT_WINDOW_DAYS = 14;
