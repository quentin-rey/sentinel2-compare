import type { Map as MapLibreMap } from "maplibre-gl";

// Natural Earth 1:110m admin-0 (countries) + admin-1 (states/provinces)
// boundaries — global orientation lines for anywhere on Earth, unlike the
// France-only départements/villes overlay in adminLayers.ts. Public domain,
// same tier of dependency as Nominatim/Earth Search elsewhere in this app.
// Fetched once per session and cached (module scope, not per-map) since
// every map instance can reuse the same GeoJSON.
const COUNTRIES_URL = "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector/geojson/ne_110m_admin_0_countries.geojson";
const STATES_URL = "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector/geojson/ne_110m_admin_1_states_provinces.geojson";

const COUNTRIES_SOURCE = "world-countries-src";
const COUNTRIES_LINE_LAYER = "world-countries-line";
const STATES_SOURCE = "world-states-src";
const STATES_LINE_LAYER = "world-states-line";

// Insertion-point role — see firstOverlayLayerId (lib/overlayLayers.ts).
export const WORLD_BORDER_LAYER_IDS = [STATES_LINE_LAYER, COUNTRIES_LINE_LAYER];

export const DEFAULT_WORLD_BORDERS_OPACITY = 0.6;

let countriesPromise: Promise<GeoJSON.FeatureCollection> | null = null;
let statesPromise: Promise<GeoJSON.FeatureCollection> | null = null;

function loadJson(url: string): Promise<GeoJSON.FeatureCollection> {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
}

function loadCountries(): Promise<GeoJSON.FeatureCollection> {
  if (!countriesPromise) {
    countriesPromise = loadJson(COUNTRIES_URL).catch((err) => {
      countriesPromise = null; // allow a retry on the next toggle
      throw err;
    });
  }
  return countriesPromise;
}

function loadStates(): Promise<GeoJSON.FeatureCollection> {
  if (!statesPromise) {
    statesPromise = loadJson(STATES_URL).catch((err) => {
      statesPromise = null;
      throw err;
    });
  }
  return statesPromise;
}

// States render thinner/dimmer than countries so the hierarchy reads at a
// glance without needing name labels (kept out of scope for v1, same as
// départements' plain outline — only villes carry labels).
export async function addWorldBordersLayer(map: MapLibreMap, opacity = DEFAULT_WORLD_BORDERS_OPACITY): Promise<void> {
  if (map.getSource(COUNTRIES_SOURCE)) return;
  const [countries, states] = await Promise.all([loadCountries(), loadStates()]);
  if (map.getSource(COUNTRIES_SOURCE)) return; // toggled off again while the fetch was in flight

  map.addSource(STATES_SOURCE, { type: "geojson", data: states });
  map.addLayer({
    id: STATES_LINE_LAYER,
    type: "line",
    source: STATES_SOURCE,
    paint: { "line-color": "#ffffff", "line-width": 0.7, "line-opacity": opacity * 0.6 },
  });

  map.addSource(COUNTRIES_SOURCE, { type: "geojson", data: countries });
  map.addLayer({
    id: COUNTRIES_LINE_LAYER,
    type: "line",
    source: COUNTRIES_SOURCE,
    paint: { "line-color": "#ffffff", "line-width": 1.4, "line-opacity": opacity },
  });
}

export function removeWorldBordersLayer(map: MapLibreMap): void {
  for (const [layer, source] of [
    [STATES_LINE_LAYER, STATES_SOURCE],
    [COUNTRIES_LINE_LAYER, COUNTRIES_SOURCE],
  ] as const) {
    if (map.getLayer(layer)) map.removeLayer(layer);
    if (map.getSource(source)) map.removeSource(source);
  }
}

export function setWorldBordersOpacity(map: MapLibreMap, opacity: number): void {
  if (map.getLayer(COUNTRIES_LINE_LAYER)) map.setPaintProperty(COUNTRIES_LINE_LAYER, "line-opacity", opacity);
  if (map.getLayer(STATES_LINE_LAYER)) map.setPaintProperty(STATES_LINE_LAYER, "line-opacity", opacity * 0.6);
}
