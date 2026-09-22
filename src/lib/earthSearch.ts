// Scene metadata lookup against AWS Earth Search (Element84) — a free,
// no-auth STAC API over the public "sentinel-cogs" S3 bucket. Replaces the
// Copernicus Data Space Ecosystem (CDSE) OData catalogue this app used to
// query: CDSE's own account-level WMTS quota (Sentinel Hub) was causing
// recurring 429/403 failures under real usage, and Earth Search has no such
// quota (public S3, no account tied to it).
//
// Trade-off accepted knowingly: this project used to query Earth Search for
// metadata already, and switched away specifically because AWS's mirror can
// lag the official archive by hours to days for very recent acquisitions.
// That lag is back in exchange for no longer depending on a shared quota.
const EARTH_SEARCH_ENDPOINT = "https://earth-search.aws.element84.com/v1/search";

// Band-asset hrefs + UTM zone for a resolved scene — shape matches
// lib/cogRaster.ts's SceneAssets (the client-side COG renderer), declared
// separately here to keep this module's only dependency an HTTP fetch.
interface SceneAssets {
  epsg: number;
  assets: Record<string, string>;
}

export type Bbox = [west: number, south: number, east: number, north: number];

export type ScenePriority = "closest" | "leastcloud";

interface LoadSceneDataOptions {
  windowDays?: number;
  maxCloud?: number;
  priority?: ScenePriority;
}

interface SceneInfo {
  found: boolean;
  count: number;
  tileCount: number;
  bestDate?: string;
  bestCloudCover?: number;
  // Every same-day tile covering the query viewport (see bestPerTile) — the
  // mosaic set the renderer composites. Never empty when found is true.
  bestProductIds?: string[];
}

export interface SceneDate {
  date: string;
  cloudCover: number | null;
  tileCount: number;
  dayDiff: number;
  productIds: string[];
}

interface LoadSceneDataResult {
  info: SceneInfo;
  dates: SceneDate[];
}

interface StacFeature {
  id: string;
  // The scene's own footprint extent (one MGRS tile) — distinct from the
  // *query* bbox passed to querySceneList. Used to pick, among same-day
  // candidates from different tiles, whichever one actually covers the
  // requested viewport instead of an arbitrary "first in the response" pick
  // (see chooseBestCandidate below).
  bbox: Bbox;
  properties: {
    datetime: string;
    "eo:cloud_cover"?: number;
    "grid:code"?: string;
    "proj:epsg"?: number;
  };
  assets: Record<string, { href: string }>;
}

// Full items (assets + UTM zone) are cached by id as search results come in
// — the renderer looks a scene's assets up here once its day is picked,
// with no extra network round-trip in the common case. Generous on purpose:
// a single dual-date compare search over a location spanning several MGRS
// tiles can return hundreds of features (one per tile per revisit day) —
// with a too-small cap, a scene resolved moments ago could get evicted
// before it's actually used to render (observed: 100 was nowhere near
// enough, causing a resolved side to silently never render). Not a hard
// guarantee either way, which is why getSceneAssets() below also falls
// back to re-fetching a single evicted item directly rather than failing.
const ITEM_CACHE_LIMIT = 500;
const itemCache = new Map<string, StacFeature>();

function cacheItem(feature: StacFeature): void {
  if (itemCache.size >= ITEM_CACHE_LIMIT && !itemCache.has(feature.id)) {
    const oldest = itemCache.keys().next().value;
    if (oldest !== undefined) itemCache.delete(oldest);
  }
  itemCache.set(feature.id, feature);
}

// Asset keys used by lib/config.ts's RENDER_MODE_BANDS — must list every
// key that appears in any RENDER_MODE_BANDS entry, or getSceneAssets()
// silently omits that band's href and rendering fails with "Asset manquant".
const BAND_ASSET_KEYS = ["red", "green", "blue", "nir", "nir08", "rededge1", "swir16", "swir22", "scl"];

// Cache miss fallback — fetches this one item directly by id (a single,
// fast request) rather than failing outright. Makes asset resolution
// correct regardless of ITEM_CACHE_LIMIT/eviction churn, not just "usually
// fine at the current cache size".
async function fetchItemById(id: string): Promise<StacFeature | undefined> {
  try {
    const res = await fetch(`https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/${id}`);
    if (!res.ok) return undefined;
    const item: StacFeature = await res.json();
    cacheItem(item);
    return item;
  } catch {
    return undefined;
  }
}

export async function getSceneAssets(productId: string): Promise<SceneAssets | undefined> {
  const item = itemCache.get(productId) ?? (await fetchItemById(productId));
  const epsg = item?.properties["proj:epsg"];
  if (!item || !epsg) return undefined;
  const assets: Record<string, string> = {};
  for (const key of BAND_ASSET_KEYS) {
    const href = item.assets[key]?.href;
    if (href) assets[key] = href;
  }
  return { epsg, assets };
}

interface DayEntry {
  date: string;
  // One STAC item id per MGRS tile actually captured this exact day (see
  // bestPerTile) — the mosaic set the renderer composites. tiles.size and
  // productIds.length are always equal.
  productIds: string[];
  tiles: Set<string>;
  cloudCover: number | null;
  dayDiff: number;
}

// "MGRS-31UDQ" -> "31UDQ" (falls back to the raw code if the prefix isn't
// there, so a format change upstream degrades to "one tile per code" rather
// than throwing).
function tileCodeFromGridCode(gridCode: string | undefined, fallback: string): string {
  if (!gridCode) return fallback;
  return gridCode.startsWith("MGRS-") ? gridCode.slice(5) : gridCode;
}

function bboxOverlapArea(a: Bbox, b: Bbox): number {
  const west = Math.max(a[0], b[0]);
  const south = Math.max(a[1], b[1]);
  const east = Math.min(a[2], b[2]);
  const north = Math.min(a[3], b[3]);
  if (east <= west || north <= south) return 0;
  return (east - west) * (north - south);
}

// Among same-tile candidates (normally just one, but a tile can be
// reprocessed under a new baseline, yielding two STAC items for the same
// day+tile), picks whichever footprint overlaps the query bbox the most,
// ties broken by cloud cover.
function chooseBestCandidate(bbox: Bbox, candidates: StacFeature[]): StacFeature {
  return candidates.reduce((best, candidate) => {
    const bestOverlap = bboxOverlapArea(bbox, best.bbox);
    const candidateOverlap = bboxOverlapArea(bbox, candidate.bbox);
    if (candidateOverlap !== bestOverlap) return candidateOverlap > bestOverlap ? candidate : best;
    const bestCloud = best.properties["eo:cloud_cover"] ?? 100;
    const candidateCloud = candidate.properties["eo:cloud_cover"] ?? 100;
    return candidateCloud < bestCloud ? candidate : best;
  });
}

// Hard cap on how many same-day tiles a single mosaic ever composites.
// Without one, a dezoomed viewport (e.g. zoom 5-6, scanning a whole
// coastline for a storm) can span 30-40+ MGRS tiles — each one needs its
// own COG metadata fetch, band reads and per-pixel reprojection, and that
// fan-out made the app effectively hang in production (never finishing the
// initial render) rather than just being slow. 12 tiles is already a huge
// mosaic (~4x the original single-scene footprint per side) and comfortably
// covers the "wide event, not the whole continent" use case that motivated
// mosaicking in the first place (issue #27) without the unbounded cost.
const MAX_MOSAIC_TILES = 12;

// A viewport straddling two adjacent MGRS tiles (common near a tile
// boundary — e.g. central Paris sits right on the 31UDP/31UDQ seam) can get
// same-day features from *both* tiles (issue #27). Returns one winning
// candidate *per tile*, capped at MAX_MOSAIC_TILES and prioritized by
// overlap with the query viewport — the renderer (cogRaster.ts's
// renderRegionRGBA) composites every tile it's given, per output pixel, so
// handing it every same-day tile instead of a single overall "best" one
// fills in the rest of the requested view instead of leaving it blank.
// Deliberately same-day only: mixing tiles from *different* days into one
// mosaic would silently blend two different acquisition dates into a
// single "before"/"after" image, undermining the exact-date-to-exact-date
// comparison this app promises (see the discussion on issue #27) — a tile
// with no data on this exact day is simply absent from the result, not
// backfilled from another day.
function bestPerTile(bbox: Bbox, candidates: StacFeature[]): StacFeature[] {
  const byTile = new Map<string, StacFeature[]>();
  for (const c of candidates) {
    const tile = tileCodeFromGridCode(c.properties["grid:code"], c.id);
    const group = byTile.get(tile);
    if (group) group.push(c);
    else byTile.set(tile, [c]);
  }
  const winners = [...byTile.values()].map((group) => chooseBestCandidate(bbox, group));
  if (winners.length <= MAX_MOSAIC_TILES) return winners;
  return winners
    .slice()
    .sort((a, b) => bboxOverlapArea(bbox, b.bbox) - bboxOverlapArea(bbox, a.bbox))
    .slice(0, MAX_MOSAIC_TILES);
}

async function querySceneList(bbox: Bbox, start: Date, end: Date): Promise<StacFeature[]> {
  const params = new URLSearchParams({
    collections: "sentinel-2-l2a",
    bbox: bbox.join(","),
    datetime: `${start.toISOString()}/${end.toISOString()}`,
    limit: "100",
  });

  const res = await fetch(`${EARTH_SEARCH_ENDPOINT}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Recherche de métadonnées échouée (HTTP ${res.status}).`);
  }
  const json = await res.json();
  const features: StacFeature[] = json.features || [];
  for (const f of features) cacheItem(f);
  return features;
}

/**
 * Single logical lookup that returns both:
 * - `info`: the best-matching day near `targetDateStr`, used to pin the
 *   render request.
 * - `dates`: the distinct calendar days with coverage near `targetDateStr`,
 *   in chronological order — lets the user pick a specific day themselves
 *   when the bbox spans more than one MGRS grid tile (`tileCount` > 1 for a
 *   given day means only some of those tiles were captured that day, so
 *   part of the view may render blank/no-data for that pick).
 *
 * Unlike the CDSE version this replaces, `eo:cloud_cover` is already present
 * on every search result — there's no separate per-product detail fetch
 * needed just to learn cloud cover.
 *
 * `priority` controls how "best" (for `info`) is decided:
 * - "closest" (default): the day closest to the target date wins, regardless
 *   of cloud cover, so no cloudy/smoky day is ever excluded from `info`.
 * - "leastcloud": the least cloudy day within the window wins.
 */
export async function loadSceneData(
  bbox: Bbox,
  targetDateStr: string,
  { windowDays = 14, maxCloud = 30, priority = "closest" }: LoadSceneDataOptions = {},
): Promise<LoadSceneDataResult> {
  const target = new Date(targetDateStr + "T00:00:00Z");
  const start = new Date(target.getTime() - windowDays * 86400000);
  const end = new Date(target.getTime() + windowDays * 86400000);

  const features = await querySceneList(bbox, start, end);
  if (features.length === 0) {
    return { info: { found: false, count: 0, tileCount: 0 }, dates: [] };
  }

  const byDay = new Map<string, { date: string; candidates: StacFeature[]; tiles: Set<string> }>();
  const allTiles = new Set<string>();
  for (const f of features) {
    const day = f.properties.datetime.slice(0, 10);
    const tile = tileCodeFromGridCode(f.properties["grid:code"], f.id);
    allTiles.add(tile);
    if (!byDay.has(day)) byDay.set(day, { date: day, candidates: [], tiles: new Set() });
    const entry = byDay.get(day)!;
    entry.tiles.add(tile);
    entry.candidates.push(f);
  }

  const days: DayEntry[] = [...byDay.values()].map((d) => {
    // Representative cloud cover for the day (used for priority sorting and
    // the label) is still the single best-overlap tile's — cloud cover is
    // inherently per-tile, so there's no one meaningful scalar across a
    // multi-tile mosaic; the best-covering tile's value is the closest
    // proxy, same as before mosaicking existed.
    const best = chooseBestCandidate(bbox, d.candidates);
    return {
      date: d.date,
      productIds: bestPerTile(bbox, d.candidates).map((f) => f.id),
      cloudCover: best.properties["eo:cloud_cover"] ?? 100,
      tiles: d.tiles,
      dayDiff: Math.abs(new Date(d.date + "T00:00:00Z").getTime() - target.getTime()) / 86400000,
    };
  });

  let info: SceneInfo;
  if (priority === "leastcloud") {
    const candidates = days.filter((d) => (d.cloudCover ?? 100) < maxCloud);
    if (candidates.length === 0) {
      info = { found: false, count: 0, tileCount: allTiles.size };
    } else {
      const best = candidates.reduce((a, b) =>
        b.cloudCover! * 1000 + b.dayDiff < a.cloudCover! * 1000 + a.dayDiff ? b : a,
      );
      info = {
        found: true,
        count: candidates.length,
        tileCount: allTiles.size,
        bestDate: best.date,
        bestCloudCover: best.cloudCover!,
        bestProductIds: best.productIds,
      };
    }
  } else {
    // "closest": maxCloud is a *preference*, not an exclusion — take the
    // nearest day under the ceiling, or fall back to the true closest day
    // regardless of cloud if none qualify, so a smoky wildfire scene is
    // never hidden just because nothing nearby is clear.
    const byProximity = [...days].sort((a, b) => a.dayDiff - b.dayDiff);
    const underCeiling = byProximity.find((d) => (d.cloudCover ?? 100) < maxCloud);
    const best = underCeiling || byProximity[0];
    info = {
      found: true,
      count: days.length,
      tileCount: allTiles.size,
      bestDate: best.date,
      bestCloudCover: best.cloudCover ?? 100,
      bestProductIds: best.productIds,
    };
  }

  // Chronological (not proximity) order — a plain calendar list reads far
  // more naturally in the picker dropdown than "closest first" jumping back
  // and forth across the target date.
  const dates: SceneDate[] = days
    .map(({ date, cloudCover, tiles, dayDiff, productIds }) => ({
      date,
      cloudCover,
      tileCount: tiles.size,
      dayDiff,
      productIds,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { info, dates };
}
