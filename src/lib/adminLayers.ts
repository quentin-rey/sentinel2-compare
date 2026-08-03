import type { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import type { FilterSpecification, DataDrivenPropertyValueSpecification } from "@maplibre/maplibre-gl-style-spec";

// Simplified French département boundaries (métropole only — no DOM-TOM),
// ~550 KB. Community-maintained, free, no auth — same tier of dependency as
// Nominatim/Earth Search elsewhere in this app. Fetched once per session and
// cached (module scope, not per-map) since every map instance can reuse the
// same GeoJSON.
const DEPARTEMENTS_URL = "https://cdn.jsdelivr.net/gh/gregoiredavid/france-geojson@master/departements-version-simplifiee.geojson";

const DEPARTEMENTS_SOURCE = "departements-src";
const DEPARTEMENTS_LINE_LAYER = "departements-line";

const VILLES_SOURCE = "villes-src";
const VILLES_CIRCLE_LAYER = "villes-circle";
const VILLES_LABEL_LAYER = "villes-label";

// Bottommost-first: whichever of these exists lowest in the style's layer
// stack is the one to insert new satellite-imagery layers *below* (see
// firstAdminLayerId) so a reloaded scene never paints over these overlays.
const ADMIN_LAYER_IDS = [DEPARTEMENTS_LINE_LAYER, VILLES_CIRCLE_LAYER, VILLES_LABEL_LAYER];

// setSceneLayer (useCompareMaps.ts) re-adds the satellite raster layer from
// scratch on every scene reload (initial display, render-mode change,
// manual date pick) — `map.addLayer()` with no `beforeId` always appends at
// the very top of the stack, which would bury an already-present
// départements/villes overlay under the new imagery. Passing this as
// `beforeId` inserts the raster right below the lowest overlay layer
// instead, so the overlays stay on top no matter which one loads first.
export function firstAdminLayerId(map: MapLibreMap): string | undefined {
  const layers = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    if (ADMIN_LAYER_IDS.includes(layer.id)) return layer.id;
  }
  return undefined;
}

interface DepartementProperties {
  code: string;
  nom: string;
}

type DepartementFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, DepartementProperties>;
type DepartementCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, DepartementProperties>;

interface CommuneProperties {
  nom: string;
  code: string;
  population: number | null;
}

type CommuneCollection = GeoJSON.FeatureCollection<GeoJSON.Point, CommuneProperties>;

const EMPTY_COLLECTION: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// Fetched once per page load, shared by every map instance (base map + the
// two compare-mode maps all point at the same in-memory object).
let departementsPromise: Promise<DepartementCollection> | null = null;

function loadDepartements(): Promise<DepartementCollection> {
  if (!departementsPromise) {
    departementsPromise = fetch(DEPARTEMENTS_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        departementsPromise = null; // allow a retry on the next toggle
        throw err;
      });
  }
  return departementsPromise;
}

function bboxOfGeometry(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const rings = geom.type === "Polygon" ? geom.coordinates : geom.coordinates.flat();
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

function bboxesIntersect(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

// Only département *bounding boxes* are compared against the viewport (not
// the actual polygon outline) — cheap, and good enough to decide which
// départements' communes are worth fetching.
async function departementCodesInBbox(viewBbox: [number, number, number, number]): Promise<string[]> {
  const collection = await loadDepartements();
  return collection.features
    .filter((f: DepartementFeature) => bboxesIntersect(bboxOfGeometry(f.geometry), viewBbox))
    .map((f: DepartementFeature) => f.properties.code);
}

export const DEFAULT_DEPARTEMENTS_OPACITY = 0.6;
export const DEFAULT_VILLES_TEXT_COLOR = "#000000";
export const DEFAULT_VILLES_HALO = true;
export const DEFAULT_VILLES_SIZE_SCALE = 1;

// Text color is a plain black/white choice (see LayersSection.tsx) — the
// halo always uses the opposite of whichever one is picked, so it stays
// legible against either without needing its own separate control.
function haloColorFor(textColor: string): string {
  return textColor === "#ffffff" ? "#000000" : "#ffffff";
}

// Boundaries only — no fill, no name labels, just a white outline whose
// opacity the user controls (see setDepartementsOpacity) so it reads well
// over any satellite render mode (true color, false color, wildfire...).
export async function addDepartementsLayer(map: MapLibreMap, opacity = DEFAULT_DEPARTEMENTS_OPACITY): Promise<void> {
  if (map.getSource(DEPARTEMENTS_SOURCE)) return;
  const data = await loadDepartements();
  if (map.getSource(DEPARTEMENTS_SOURCE)) return; // toggled off again while the fetch was in flight
  map.addSource(DEPARTEMENTS_SOURCE, { type: "geojson", data });
  map.addLayer({
    id: DEPARTEMENTS_LINE_LAYER,
    type: "line",
    source: DEPARTEMENTS_SOURCE,
    paint: { "line-color": "#ffffff", "line-width": 1.2, "line-opacity": opacity },
  });
}

export function removeDepartementsLayer(map: MapLibreMap): void {
  if (map.getLayer(DEPARTEMENTS_LINE_LAYER)) map.removeLayer(DEPARTEMENTS_LINE_LAYER);
  if (map.getSource(DEPARTEMENTS_SOURCE)) map.removeSource(DEPARTEMENTS_SOURCE);
}

export function setDepartementsOpacity(map: MapLibreMap, opacity: number): void {
  if (map.getLayer(DEPARTEMENTS_LINE_LAYER)) map.setPaintProperty(DEPARTEMENTS_LINE_LAYER, "line-opacity", opacity);
}

function villesTextSizeExpression(sizeScale: number): DataDrivenPropertyValueSpecification<number> {
  return ["*", sizeScale, ["interpolate", ["linear"], ["get", "population"], 1000, 10, 500000, 15]];
}

export interface VillesTextStyle {
  color: string;
  halo: boolean;
  sizeScale: number;
}

// Returns true the first time this map gets the layer (the caller should
// follow up with a refreshVilles() fetch), false if it already existed (the
// caller is just re-applying a filter/opacity tweak — no refetch needed).
export function addVillesLayer(
  map: MapLibreMap,
  textStyle: VillesTextStyle = { color: DEFAULT_VILLES_TEXT_COLOR, halo: DEFAULT_VILLES_HALO, sizeScale: DEFAULT_VILLES_SIZE_SCALE },
): boolean {
  if (map.getSource(VILLES_SOURCE)) return false;
  map.addSource(VILLES_SOURCE, { type: "geojson", data: EMPTY_COLLECTION });
  map.addLayer({
    id: VILLES_CIRCLE_LAYER,
    type: "circle",
    source: VILLES_SOURCE,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["get", "population"], 1000, 2, 50000, 4, 500000, 7],
      "circle-color": "#3388ff",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1,
    },
  });
  map.addLayer({
    id: VILLES_LABEL_LAYER,
    type: "symbol",
    source: VILLES_SOURCE,
    layout: {
      "text-field": ["get", "nom"],
      "text-font": ["Open Sans Regular"],
      "text-size": villesTextSizeExpression(textStyle.sizeScale),
      "text-offset": [0, 1.1],
      "text-anchor": "top",
      // Renders bigger cities first so they win the label-collision fight at
      // low zoom; smaller towns fade in once there's room, without needing
      // any manual population/zoom filter.
      "symbol-sort-key": ["-", 0, ["get", "population"]],
    },
    paint: {
      "text-color": textStyle.color,
      "text-halo-color": haloColorFor(textStyle.color),
      "text-halo-width": textStyle.halo ? 1.2 : 0,
    },
  });
  return true;
}

export function removeVillesLayer(map: MapLibreMap): void {
  for (const id of [VILLES_LABEL_LAYER, VILLES_CIRCLE_LAYER]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(VILLES_SOURCE)) map.removeSource(VILLES_SOURCE);
}

// User-controlled "how many cities" knob — a straight population floor
// applied as a layer filter (no refetch needed, unlike the zoom/bbox-driven
// refreshVilles), so raising it prunes labels immediately without a
// network round-trip.
export function setVillesMinPopulation(map: MapLibreMap, minPopulation: number): void {
  const filter: FilterSpecification = [">=", ["get", "population"], minPopulation];
  if (map.getLayer(VILLES_CIRCLE_LAYER)) map.setFilter(VILLES_CIRCLE_LAYER, filter);
  if (map.getLayer(VILLES_LABEL_LAYER)) map.setFilter(VILLES_LABEL_LAYER, filter);
}

export function setVillesTextColor(map: MapLibreMap, color: string): void {
  if (!map.getLayer(VILLES_LABEL_LAYER)) return;
  map.setPaintProperty(VILLES_LABEL_LAYER, "text-color", color);
  map.setPaintProperty(VILLES_LABEL_LAYER, "text-halo-color", haloColorFor(color));
}

export function setVillesHalo(map: MapLibreMap, enabled: boolean): void {
  if (map.getLayer(VILLES_LABEL_LAYER)) map.setPaintProperty(VILLES_LABEL_LAYER, "text-halo-width", enabled ? 1.2 : 0);
}

export function setVillesTextSizeScale(map: MapLibreMap, sizeScale: number): void {
  if (map.getLayer(VILLES_LABEL_LAYER)) map.setLayoutProperty(VILLES_LABEL_LAYER, "text-size", villesTextSizeExpression(sizeScale));
}

// Below this zoom, a viewport can span dozens of départements — querying
// each one's communes individually would mean dozens of parallel requests
// for a view too zoomed-out to render the labels usefully anyway.
const VILLES_MIN_ZOOM = 7;
// Hard cap for the same reason, in case a wide/rotated viewport still spans
// many départements just above VILLES_MIN_ZOOM.
const MAX_DEPARTEMENTS_PER_FETCH = 12;

const communesCache = new Map<string, Promise<CommuneCollection>>();

function fetchCommunesForDepartement(code: string): Promise<CommuneCollection> {
  let cached = communesCache.get(code);
  if (!cached) {
    // geometry=mairie (not the default "centre") — issue #40: "centre" is
    // the commune polygon's geometric centroid, which for large/irregularly
    // shaped communes (e.g. one spanning coastline to inland lakes) can sit
    // km away from the actual built-up town. The town hall is, by
    // definition, always inside the built-up area.
    const url = `https://geo.api.gouv.fr/departements/${code}/communes?fields=nom,code,mairie,population&format=geojson&geometry=mairie`;
    cached = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        communesCache.delete(code);
        throw err;
      });
    communesCache.set(code, cached);
  }
  return cached;
}

// Refetches the "villes" (communes) data for whichever départements
// currently intersect `viewBbox`, and pushes the merged result into every
// given map's villes source (mapA/mapB share one viewport, so a single fetch
// serves both instead of doubling the request count).
export async function refreshVilles(maps: MapLibreMap[], viewBbox: [number, number, number, number], zoom: number): Promise<void> {
  const targets = maps.filter((m) => m.getSource(VILLES_SOURCE));
  if (targets.length === 0) return;

  if (zoom < VILLES_MIN_ZOOM) {
    for (const map of targets) (map.getSource(VILLES_SOURCE) as GeoJSONSource).setData(EMPTY_COLLECTION);
    return;
  }

  const codes = (await departementCodesInBbox(viewBbox)).slice(0, MAX_DEPARTEMENTS_PER_FETCH);
  const collections = await Promise.all(codes.map((code) => fetchCommunesForDepartement(code).catch(() => null)));

  const features: GeoJSON.Feature<GeoJSON.Point, CommuneProperties>[] = [];
  for (const collection of collections) {
    if (!collection) continue;
    for (const feature of collection.features) {
      if ((feature.properties.population ?? 0) > 0) features.push(feature);
    }
  }
  const merged: CommuneCollection = { type: "FeatureCollection", features };

  for (const map of targets) {
    (map.getSource(VILLES_SOURCE) as GeoJSONSource).setData(merged);
  }
}
