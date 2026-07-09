// Instance ID from your Copernicus Data Space Ecosystem "Configuration Utility"
// (https://shapps.dataspace.copernicus.eu/dashboard/#/configurations).
// Public by design (embedded in the frontend) — it identifies your quota, not a secret.
export const SH_INSTANCE_ID = "fec3f31d-086f-4d6e-af7c-cc751e1a3557";

export type RenderMode = "true-color" | "false-color" | "honc" | "fire";

// Must match the Layer IDs created in the CDSE configuration.
export const MODE_LAYERS: Record<RenderMode, string> = {
  "true-color": "TRUE-COLOR",
  "false-color": "FALSE-COLOR",
  honc: "TCO-L2A", // HONC custom script (cbrt(0.6x)), pasted into the L2A "TCO" layer
  fire: "WILDFIRE", // built-in CDSE template, not the custom QuickFire script
};

export const DEFAULT_MAX_CLOUD = 30;
export const DEFAULT_WINDOW_DAYS = 30;
