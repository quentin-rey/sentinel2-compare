// Read-only metadata lookup against the Copernicus Data Space Ecosystem's
// own OData catalogue — the same archive that feeds the Sentinel Hub WMTS
// tiles this app renders. Used to resolve which exact Sentinel-2 scene to
// show (so the WMTS render call can be pinned to that exact date instead of
// an open-ended window), to display the real acquisition date/cloud cover,
// and to detect up front when nothing usable exists near a requested date.
//
// This used to query AWS Earth Search's public STAC API instead. Switched
// to CDSE's own catalogue because AWS's mirror lags the official archive by
// hours to days for very recent acquisitions — exactly the case that
// matters most (e.g. checking for a wildfire scene from the last day or
// two), and it could silently point at the wrong day. CDSE's catalogue is
// authoritative for what the WMTS can actually render, and its OData API is
// public and CORS-enabled (no auth needed for search).
const CDSE_ENDPOINT = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products";

function bboxToWkt([west, south, east, north]) {
  return `POLYGON((${west} ${south},${east} ${south},${east} ${north},${west} ${north},${west} ${south}))`;
}

// Tile code (e.g. "31TCK") is embedded in the product name, so the cheap
// list query doesn't need to ask for it as structured metadata.
function tileCodeFromName(name) {
  return name.match(/_T(\d{2}[A-Z]{3})_/)?.[1] || name;
}

// Deliberately *without* $expand=Attributes: on CDSE's API that join is the
// expensive part of the query (measured ~7-10s for a ~100-row result),
// while the same search with only Id/Name/ContentDate selected comes back
// in ~2-3s. Cloud cover (which lives in Attributes) is fetched afterwards,
// per-product, only for the specific day(s) that actually need it.
async function querySceneList(bbox, start, end) {
  const params = new URLSearchParams();
  params.set(
    "$filter",
    `Collection/Name eq 'SENTINEL-2' and contains(Name,'MSIL2A') and ` +
      `OData.CSC.Intersects(area=geography'SRID=4326;${bboxToWkt(bbox)}') and ` +
      `ContentDate/Start gt ${start.toISOString()} and ContentDate/Start lt ${end.toISOString()}`
  );
  params.set("$select", "Id,Name,ContentDate");
  params.set("$top", "100");
  params.set("$orderby", "ContentDate/Start desc");

  const res = await fetch(`${CDSE_ENDPOINT}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Recherche de métadonnées échouée (HTTP ${res.status}).`);
  }
  const json = await res.json();
  return json.value || [];
}

// Fetching a single product by id (with its Attributes) is fast — the slow
// part on CDSE's side is joining Attributes across a whole result set, not
// looking them up for one row. Exported so the UI can lazily fetch cloud
// cover for picker entries it doesn't need yet (see js/app.js).
export async function fetchDayCloudCover(productId) {
  try {
    const res = await fetch(`${CDSE_ENDPOINT}(${productId})?$expand=Attributes`);
    if (!res.ok) return 100;
    const product = await res.json();
    const attr = (product.Attributes || []).find(a => a.Name === "cloudCover");
    return typeof attr?.Value === "number" ? attr.Value : 100;
  } catch {
    return 100;
  }
}

/**
 * Single logical lookup that returns both:
 * - `info`: { found, count, tileCount, bestDate, bestCloudCover } — the
 *   best-matching day near `targetDateStr`, used to pin the WMTS request.
 * - `dates`: the distinct calendar days with coverage near `targetDateStr`,
 *   in chronological order — lets the user pick a specific day themselves when
 *   the bbox spans more than one MGRS grid tile (`tileCount` > 1 for a given
 *   day means only some of those tiles were captured that day, so part of
 *   the view may render blank/no-data for that pick). Each entry carries a
 *   `productId` so the UI can fetch its cloud cover on demand (see
 *   `fetchDayCloudCover`) — `cloudCover` here is `null` unless it was
 *   already needed to resolve `info` (see `priority` below), to avoid
 *   fetching cloud cover for days nobody will ever look at.
 *
 * `priority` controls how "best" (for `info`) is decided:
 * - "closest" (default): the day closest to the target date wins, regardless
 *   of cloud cover, so no cloud lookups are needed except one, for that
 *   winning day's displayed %.
 * - "leastcloud": the least cloudy day within the window wins — this does
 *   need cloud cover for every candidate day, fetched in parallel.
 */
export async function loadSceneData(bbox, targetDateStr, { windowDays = 30, maxCloud = 30, priority = "closest" } = {}) {
  const target = new Date(targetDateStr + "T00:00:00Z");
  const start = new Date(target.getTime() - windowDays * 86400000);
  const end = new Date(target.getTime() + windowDays * 86400000);

  const products = await querySceneList(bbox, start, end);
  if (products.length === 0) {
    return { info: { found: false, count: 0, tileCount: 0 }, dates: [] };
  }

  const byDay = new Map();
  const allTiles = new Set();
  for (const p of products) {
    const day = p.ContentDate.Start.slice(0, 10);
    const tile = tileCodeFromName(p.Name);
    allTiles.add(tile);
    if (!byDay.has(day)) byDay.set(day, { date: day, productId: p.Id, tiles: new Set(), cloudCover: null });
    byDay.get(day).tiles.add(tile);
  }

  const days = [...byDay.values()].map(d => ({
    ...d,
    dayDiff: Math.abs(new Date(d.date + "T00:00:00Z").getTime() - target.getTime()) / 86400000
  }));

  let info;
  if (priority === "leastcloud") {
    // Deciding the winner needs cloud cover for every candidate day.
    await Promise.all(days.map(async d => { d.cloudCover = await fetchDayCloudCover(d.productId); }));
    const candidates = days.filter(d => d.cloudCover < maxCloud);
    if (candidates.length === 0) {
      info = { found: false, count: 0, tileCount: allTiles.size };
    } else {
      const best = candidates.reduce((a, b) => (b.cloudCover * 1000 + b.dayDiff < a.cloudCover * 1000 + a.dayDiff ? b : a));
      info = {
        found: true, count: candidates.length, tileCount: allTiles.size,
        bestDate: best.date, bestCloudCover: best.cloudCover
      };
    }
  } else {
    // "closest": maxCloud is a *preference*, not an exclusion — check cloud
    // cover for a handful of the nearest candidates (cheap: a few parallel
    // per-scene lookups, not the whole window) and take the first one under
    // the ceiling. If none qualify, fall back to the true closest day
    // regardless of cloud, so a smoky wildfire scene is never hidden just
    // because nothing nearby is clear.
    const byProximity = [...days].sort((a, b) => a.dayDiff - b.dayDiff);
    const nearest = byProximity.slice(0, 8);
    await Promise.all(nearest.map(async d => { d.cloudCover = await fetchDayCloudCover(d.productId); }));
    const underCeiling = nearest.find(d => d.cloudCover < maxCloud);
    const best = underCeiling || byProximity[0];
    if (best.cloudCover == null) best.cloudCover = await fetchDayCloudCover(best.productId);
    info = {
      found: true, count: days.length, tileCount: allTiles.size,
      bestDate: best.date, bestCloudCover: best.cloudCover
    };
  }

  // Chronological (not proximity) order — a plain calendar list reads far
  // more naturally in the picker dropdown than "closest first" jumping back
  // and forth across the target date.
  const dates = days
    .map(({ date, cloudCover, tiles, dayDiff, productId }) => ({ date, cloudCover, tileCount: tiles.size, dayDiff, productId }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { info, dates };
}
