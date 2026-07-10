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

export type Bbox = [west: number, south: number, east: number, north: number];

export type ScenePriority = "closest" | "leastcloud";

export interface LoadSceneDataOptions {
  windowDays?: number;
  maxCloud?: number;
  priority?: ScenePriority;
}

export interface SceneInfo {
  found: boolean;
  count: number;
  tileCount: number;
  bestDate?: string;
  bestCloudCover?: number;
}

export interface SceneDate {
  date: string;
  cloudCover: number | null;
  tileCount: number;
  dayDiff: number;
  productId: string;
}

export interface LoadSceneDataResult {
  info: SceneInfo;
  dates: SceneDate[];
}

interface StacFeature {
  id: string;
  properties: {
    datetime: string;
    "eo:cloud_cover"?: number;
    "grid:code"?: string;
  };
}

interface DayEntry {
  date: string;
  productId: string;
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

// Used as a fallback when a manually-typed date isn't among the days
// already fetched by loadSceneData (so its cloud cover isn't known yet) —
// mirrors the old CDSE per-product detail fetch, kept for interface parity
// even though loadSceneData's own results always carry cloud cover inline.
export async function fetchDayCloudCover(productId: string): Promise<number> {
  try {
    const res = await fetch(`https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/${productId}`);
    if (!res.ok) return 100;
    const item = await res.json();
    const cloudCover = item?.properties?.["eo:cloud_cover"];
    return typeof cloudCover === "number" ? cloudCover : 100;
  } catch {
    return 100;
  }
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
  return json.features || [];
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

  const byDay = new Map<string, { date: string; productId: string; tiles: Set<string>; cloudCover: number }>();
  const allTiles = new Set<string>();
  for (const f of features) {
    const day = f.properties.datetime.slice(0, 10);
    const tile = tileCodeFromGridCode(f.properties["grid:code"], f.id);
    const cloudCover = f.properties["eo:cloud_cover"] ?? 100;
    allTiles.add(tile);
    if (!byDay.has(day)) byDay.set(day, { date: day, productId: f.id, tiles: new Set(), cloudCover });
    byDay.get(day)!.tiles.add(tile);
  }

  const days: DayEntry[] = [...byDay.values()].map((d) => ({
    ...d,
    dayDiff: Math.abs(new Date(d.date + "T00:00:00Z").getTime() - target.getTime()) / 86400000,
  }));

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
    };
  }

  // Chronological (not proximity) order — a plain calendar list reads far
  // more naturally in the picker dropdown than "closest first" jumping back
  // and forth across the target date.
  const dates: SceneDate[] = days
    .map(({ date, cloudCover, tiles, dayDiff, productId }) => ({
      date,
      cloudCover,
      tileCount: tiles.size,
      dayDiff,
      productId,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { info, dates };
}
