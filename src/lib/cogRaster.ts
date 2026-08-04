// Renders one MapLibre XYZ raster tile directly from Sentinel-2 L2A COGs on
// the public "sentinel-cogs" S3 bucket (no auth, no quota — see
// lib/earthSearch.ts for how scenes/assets are resolved). Replaces the old
// Sentinel Hub WMTS call: instead of asking a server to render a PNG, this
// reads the relevant window of each band COG, reprojects it from the
// scene's native UTM zone into the requested Web Mercator tile, and applies
// the same band math the CDSE evalscripts used to (see lib/renderModes.ts).
//
// Runs inside a Web Worker (see workers/cogTile.worker.ts) so decoding/
// reprojection never blocks the main thread.
import { fromUrl, type GeoTIFF, type GeoTIFFImage } from "geotiff";
import proj4 from "proj4";
import { RENDER_MODE_BANDS, type RenderMode } from "./config";
import { renderPixel } from "./renderModes";

export interface SceneAssets {
  epsg: number;
  assets: Record<string, string>;
}

const EARTH_RADIUS = 6378137;
const ORIGIN_SHIFT = Math.PI * EARTH_RADIUS;
const WEB_MERCATOR = "EPSG:3857";

// setTimeout(fn, 0) gets clamped to a ~4ms floor by browsers, which adds up
// across the several yields a single render does (see renderRegionRGBA's
// row-chunk loop) — a MessageChannel round-trip still yields to the same
// macrotask queue (so a worker's pending "cancel" message gets a chance to
// run before the loop continues) without that floor, the same trick
// scheduler implementations (e.g. React's) use for this exact reason.
//
// Multiple renders can be mid-flight in the same worker at once (this
// module's onmessage handler is async, so a new message can start before
// an earlier render's awaits resolve) — a single shared port and a plain
// `onmessage = resolve` would let a later yieldToEventLoop() call overwrite
// an earlier one's handler, orphaning it forever (its render would just
// hang). A FIFO queue instead: each call enqueues its own resolver and
// posts one message, each received message dequeues and resolves exactly
// one — correct regardless of how many renders are yielding concurrently,
// since MessageChannel delivers in post order.
let yieldChannel: MessageChannel | null = null;
const yieldQueue: (() => void)[] = [];
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    if (!yieldChannel) {
      yieldChannel = new MessageChannel();
      yieldChannel.port1.onmessage = () => yieldQueue.shift()?.();
    }
    yieldQueue.push(resolve);
    yieldChannel.port2.postMessage(null);
  });
}

function tileBoundsMeters(z: number, x: number, y: number) {
  const worldSize = 2 * ORIGIN_SHIFT;
  const tileSizeM = worldSize / 2 ** z;
  const minX = -ORIGIN_SHIFT + x * tileSizeM;
  const maxX = minX + tileSizeM;
  const maxY = ORIGIN_SHIFT - y * tileSizeM;
  const minY = maxY - tileSizeM;
  return { minX, minY, maxX, maxY };
}

// Sentinel-2's tiling grid only ever uses standard WGS84 UTM zones (EPSG
// 32601-32660 north, 32701-32760 south) — the zone/hemisphere are derivable
// directly from the EPSG code, no projection database needed.
function utmDefFor(epsg: number): string {
  const defName = `EPSG:${epsg}`;
  if (proj4.defs(defName)) return defName;
  let zone: number;
  let south: boolean;
  if (epsg >= 32601 && epsg <= 32660) {
    zone = epsg - 32600;
    south = false;
  } else if (epsg >= 32701 && epsg <= 32760) {
    zone = epsg - 32700;
    south = true;
  } else {
    throw new Error(`EPSG UTM non supporté: ${epsg}`);
  }
  proj4.defs(defName, `+proj=utm +zone=${zone}${south ? " +south" : ""} +datum=WGS84 +units=m +no_defs`);
  return defName;
}

// One GeoTIFF handle per band COG, reused across every tile of a session —
// opening it pays a handful of small metadata round-trips (~2-3s the first
// time), so reuse matters far more than any per-tile optimization.
const tiffCache = new Map<string, Promise<GeoTIFF>>();
function getTiff(href: string): Promise<GeoTIFF> {
  let cached = tiffCache.get(href);
  if (!cached) {
    // A transient failure here (e.g. one flaky request in the burst of
    // concurrent range requests a viewport's worth of tiles triggers) must
    // not get cached as a permanent rejection — every tile needing this
    // band would then fail forever, for the rest of the session, instead
    // of just this one. Deleting the cache entry on rejection lets the
    // next independent request (a later tile, a retry) try again, the same
    // self-healing readBandWindow already does for its own window cache.
    cached = fromUrl(href).catch((err) => {
      tiffCache.delete(href);
      throw err;
    });
    tiffCache.set(href, cached);
  }
  return cached;
}

interface BandWindow {
  data: ArrayLike<number>;
  width: number;
  height: number;
  bboxUtm: [number, number, number, number];
}

// Decoded-window cache, keyed on the exact (snapped) pixel window — reused
// as-is when MapLibre re-requests the same tile (mode switch, re-pan to a
// previously-seen area) and, thanks to the snap-to-grid below, often reused
// by neighboring tiles at the same zoom that happen to fall in the same
// source-pixel cell too. Capped to bound memory during a long session.
const windowCache = new Map<string, Promise<BandWindow>>();
const WINDOW_CACHE_LIMIT = 300;
const SNAP = 256;
const MIN_WINDOW = 16;

// All bands of one Sentinel-2 scene share the same footprint (co-registered
// to the same grid), so the first band's bbox stands in for the whole
// scene. Cached separately from the per-window cache since it's needed
// upfront, before any band is actually read, to skip tiles that don't
// overlap the scene at all (common at low zoom — most of the viewport is
// outside the ~110km scene footprint).
const sceneBboxCache = new Map<string, Promise<[number, number, number, number]>>();
function getSceneBbox(href: string): Promise<[number, number, number, number]> {
  let cached = sceneBboxCache.get(href);
  if (!cached) {
    // Same self-healing as getTiff above — a scene's bbox gates every one
    // of its tiles (the overlap check just above this function's call
    // site), so a permanently-cached rejection here would blank the whole
    // scene, not just one tile.
    cached = getTiff(href)
      .then(async (tiff) => (await tiff.getImage(0)).getBoundingBox() as [number, number, number, number])
      .catch((err) => {
        sceneBboxCache.delete(href);
        throw err;
      });
    sceneBboxCache.set(href, cached);
  }
  return cached;
}

// Requires more than a sliver of overlap (at least ~1 source pixel in each
// dimension) — a near-tangent tile would otherwise produce a degenerate
// (near-zero-width) read window, which has been observed to trip a pako
// "buffer error" decoding the resulting byte range.
function hasMeaningfulOverlap(a: [number, number, number, number], b: [number, number, number, number], minSize: number): boolean {
  const overlapW = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const overlapH = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return overlapW > minSize && overlapH > minSize;
}

async function pickOverview(tiff: GeoTIFF, targetGsd: number): Promise<{ index: number; bbox: [number, number, number, number] }> {
  const count = await tiff.getImageCount();
  const main = await tiff.getImage(0);
  const mainWidth = main.getWidth();
  const [mainResX] = main.getResolution();
  let best = 0;
  for (let i = 0; i < count; i++) {
    const img: GeoTIFFImage = i === 0 ? main : await tiff.getImage(i);
    const gsd = mainResX * (mainWidth / img.getWidth());
    // Keep picking coarser levels as long as they're still at least as fine
    // as this render needs — avoids downloading full 10m data for a
    // zoomed-out view. No slack: a previous 1.3x tolerance here let this
    // pick a source level up to 30% coarser than the zoom actually needs,
    // which no amount of resampling (however good) can un-blur — issue #36.
    if (gsd <= targetGsd || i === 0) best = i;
  }
  return { index: best, bbox: main.getBoundingBox() as [number, number, number, number] };
}

async function readBandWindow(href: string, targetGsd: number, utmBboxPadded: [number, number, number, number]): Promise<BandWindow> {
  const tiff = await getTiff(href);
  const { index, bbox } = await pickOverview(tiff, targetGsd);
  const img = await tiff.getImage(index);
  const w = img.getWidth();
  const h = img.getHeight();
  const [bLeft, bBottom, bRight, bTop] = bbox;
  const pxPerMx = w / (bRight - bLeft);
  const pxPerMy = h / (bTop - bBottom);

  const [reqLeft, reqBottom, reqRight, reqTop] = utmBboxPadded;
  let left = Math.floor((reqLeft - bLeft) * pxPerMx / SNAP) * SNAP;
  let right = Math.ceil((reqRight - bLeft) * pxPerMx / SNAP) * SNAP;
  let top = Math.floor((bTop - reqTop) * pxPerMy / SNAP) * SNAP;
  let bottom = Math.ceil((bTop - reqBottom) * pxPerMy / SNAP) * SNAP;
  left = Math.max(0, Math.min(w - 1, left));
  right = Math.max(left + 1, Math.min(w, right));
  top = Math.max(0, Math.min(h - 1, top));
  bottom = Math.max(top + 1, Math.min(h, bottom));

  // A tile tangent to the scene's true edge can clamp down to a read window
  // just 1 source pixel wide/tall — geotiff.js's decoder has been observed
  // to throw a pako "buffer error" on windows that thin (see the catch
  // below). Padding back out to a safe minimum size — symmetrically, still
  // clamped to the image bounds — avoids the degenerate window in the first
  // place instead of just handling the failure after the fact.
  if (right - left < MIN_WINDOW) {
    right = Math.min(w, left + MIN_WINDOW);
    left = Math.max(0, right - MIN_WINDOW);
  }
  if (bottom - top < MIN_WINDOW) {
    bottom = Math.min(h, top + MIN_WINDOW);
    top = Math.max(0, bottom - MIN_WINDOW);
  }

  const imageKey = `${href}|${index}`;
  const cacheKey = `${imageKey}|${left}|${top}|${right}|${bottom}`;
  let cached = windowCache.get(cacheKey);
  if (!cached) {
    // Reading a window flush against one of an overview's own edges has
    // been observed to throw a pako "buffer error" — traced to windows
    // overlapping the last (partial, since Sentinel-2 overview dimensions
    // are rarely a multiple of the source COG's internal tile size) row/
    // column of internal TIFF tiles, which some geotiff.js decode paths
    // mishandle (issue #22: a whole XYZ tile going blank because just one
    // band's window happened to land there). Retrying with the window
    // inset a bit more on every side each time recovers everything but a
    // thin sliver right at the true edge, instead of losing the entire
    // tile to a single failed band read. One retry (32px) was enough for
    // the 10m bands true-color/false-color/honc/fire already used, but not
    // for SWIR's 20m bands (B11/B8A/B5) — their overview images are already
    // much smaller in pixels, so a snapped 256px-aligned window covers
    // proportionally more of it, landing on a bad internal tile boundary
    // more often and needing a few more, deeper insets to clear it.
    const RETRY_INSET = 32;
    const attemptRead = async (l: number, t: number, r: number, b: number, retriesLeft: number): Promise<BandWindow> => {
      const windowBboxUtm: [number, number, number, number] = [bLeft + l / pxPerMx, bTop - b / pxPerMy, bLeft + r / pxPerMx, bTop - t / pxPerMy];
      try {
        const [data] = await img.readRasters({ window: [l, t, r, b], fillValue: 0 });
        return { data: data as unknown as ArrayLike<number>, width: r - l, height: b - t, bboxUtm: windowBboxUtm };
      } catch (err) {
        const mid = Math.floor((l + r) / 2);
        const midV = Math.floor((t + b) / 2);
        const shrunkLeft = Math.min(l + RETRY_INSET, mid);
        const shrunkTop = Math.min(t + RETRY_INSET, midV);
        const shrunkRight = Math.max(r - RETRY_INSET, mid + 1);
        const shrunkBottom = Math.max(b - RETRY_INSET, midV + 1);
        if (retriesLeft > 0 && (shrunkLeft > l || shrunkTop > t || shrunkRight < r || shrunkBottom < b)) {
          return attemptRead(shrunkLeft, shrunkTop, shrunkRight, shrunkBottom, retriesLeft - 1);
        }
        // Fail safe rather than fail the whole tile — a read that still
        // fails after retrying degrades to "no data" for just this band/
        // window instead of leaving the tile permanently blank/erroring.
        console.warn("Lecture de fenêtre COG échouée, traitée comme absente:", href, err);
        // Don't let what's presumably a transient decode hiccup permanently
        // blank this window for the rest of the session — only requests
        // already awaiting *this* promise see the degraded fallback; a
        // later, separate request for the same window gets to retry.
        windowCache.delete(cacheKey);
        // width/height 0 makes every pixel's bounds check fail below, i.e.
        // this band reads as nodata everywhere for this tile.
        return { data: new Uint16Array(0), width: 0, height: 0, bboxUtm: windowBboxUtm };
      }
    };
    cached = attemptRead(left, top, right, bottom, 4);
    if (windowCache.size >= WINDOW_CACHE_LIMIT) {
      const oldest = windowCache.keys().next().value;
      if (oldest !== undefined) windowCache.delete(oldest);
    }
    windowCache.set(cacheKey, cached);
  }
  return cached;
}

// Bilinear interpolation for a single band's already-read window, sampled
// at continuous source-pixel coordinates (issue #36: plain nearest-neighbor
// left tile/export renders visibly softer than Copernicus Browser's, since
// most output pixels land at a fractional position between source samples).
// Falls back to a plain nearest-neighbor read if any of the 4 surrounding
// samples is out of the window or nodata (0) — blending a real DN with 0
// would fade genuine pixels toward black right at scene/cloud edges, so
// those few pixels just keep today's crisper-but-blockier edge instead.
function sampleBilinear(win: BandWindow, wxf: number, wyf: number): number {
  const bx = wxf - 0.5;
  const by = wyf - 0.5;
  const x0 = Math.floor(bx);
  const y0 = Math.floor(by);
  const fx = bx - x0;
  const fy = by - y0;

  const at = (x: number, y: number): number => (x < 0 || x >= win.width || y < 0 || y >= win.height ? 0 : win.data[y * win.width + x]);

  const v00 = at(x0, y0);
  const v10 = at(x0 + 1, y0);
  const v01 = at(x0, y0 + 1);
  const v11 = at(x0 + 1, y0 + 1);
  if (v00 === 0 || v10 === 0 || v01 === 0 || v11 === 0) {
    return at(Math.floor(wxf), Math.floor(wyf));
  }

  const top = v00 * (1 - fx) + v10 * fx;
  const bottom = v01 * (1 - fx) + v11 * fx;
  return top * (1 - fy) + bottom * fy;
}

// Core renderer: samples `scene`'s bands over an arbitrary Web Mercator
// bbox (meters, same convention as tileBoundsMeters) at an arbitrary output
// resolution. renderTileRGBA (the MapLibre protocol's per-XYZ-tile path)
// and the high-resolution direct export path both delegate here — a tile
// is just the special case of a 256x256 bbox aligned to the XYZ grid.
export async function renderRegionRGBA(
  scene: SceneAssets,
  mode: RenderMode,
  bboxMerc: [minX: number, minY: number, maxX: number, maxY: number],
  outputWidth: number,
  outputHeight: number,
  shouldCancel?: () => boolean,
): Promise<Uint8ClampedArray> {
  const bandKeys = RENDER_MODE_BANDS[mode];
  const utmDef = utmDefFor(scene.epsg);
  const [minX, minY, maxX, maxY] = bboxMerc;

  const corners: [number, number][] = [
    [minX, minY],
    [maxX, minY],
    [minX, maxY],
    [maxX, maxY],
  ].map((c) => proj4(WEB_MERCATOR, utmDef, c) as [number, number]);
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const pad = (Math.max(...xs) - Math.min(...xs)) * 0.05;
  const utmBbox: [number, number, number, number] = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
  const targetGsd = (maxX - minX) / outputWidth;

  // Most tiles in a typical (zoomed-out) viewport fall entirely outside the
  // ~110km scene footprint — skip reading every band entirely for those
  // instead of paying for N wasted COG reads just to find out.
  const firstHref = scene.assets[bandKeys[0]];
  if (firstHref) {
    const sceneBbox = await getSceneBbox(firstHref);
    if (!hasMeaningfulOverlap(utmBbox, sceneBbox, targetGsd)) {
      return new Uint8ClampedArray(outputWidth * outputHeight * 4);
    }
  }

  if (shouldCancel?.()) throw new Error("Rendu annulé (tuile plus nécessaire)");

  const entries = await Promise.all(
    bandKeys.map(async (key) => {
      const href = scene.assets[key];
      if (!href) throw new Error(`Asset manquant pour la bande "${key}"`);
      return [key, await readBandWindow(href, targetGsd, utmBbox)] as const;
    }),
  );
  const windows: Record<string, BandWindow> = Object.fromEntries(entries);

  const out = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  const bandsRaw: Record<string, number> = {};
  // Yielding every few rows (instead of running the whole loop in one
  // uninterruptible burst) gives a cancelled render's worker a chance to
  // actually notice — see the cancelledIds comment in cogTile.worker.ts.
  // Chunked coarsely (quarters) since each yield has a real cost (see
  // yieldToEventLoop) — this only needs to be prompt enough to matter under
  // fast zooming, not fire on every row.
  const ROWS_PER_CHUNK = Math.max(1, Math.ceil(outputHeight / 4));
  for (let py = 0; py < outputHeight; py++) {
    if (py % ROWS_PER_CHUNK === 0) {
      if (shouldCancel?.()) throw new Error("Rendu annulé (tuile plus nécessaire)");
      await yieldToEventLoop();
    }
    const my = maxY - ((py + 0.5) / outputHeight) * (maxY - minY);
    for (let px = 0; px < outputWidth; px++) {
      const mx = minX + ((px + 0.5) / outputWidth) * (maxX - minX);
      const [ux, uy] = proj4(WEB_MERCATOR, utmDef, [mx, my]) as [number, number];
      const idx = (py * outputWidth + px) * 4;

      let nodata = false;
      for (const key of bandKeys) {
        const win = windows[key];
        const [wl, wb, wr, wt] = win.bboxUtm;
        const wxf = ((ux - wl) / (wr - wl)) * win.width;
        const wyf = ((wt - uy) / (wt - wb)) * win.height;
        const wx = Math.floor(wxf);
        const wy = Math.floor(wyf);
        if (wx < 0 || wx >= win.width || wy < 0 || wy >= win.height) {
          nodata = true;
          break;
        }
        // SCL (Scene Classification Layer) is a discrete class code
        // (0-11), not a reflectance DN — interpolating it would produce
        // meaningless fractional "classes" the cloud-class Set lookup in
        // fire() would never match, so it always stays nearest-neighbor.
        // Every other band scales by /10000 to get calibrated reflectance,
        // and is bilinearly interpolated (issue #36) for a sharper render.
        const dn = key === "scl" ? win.data[wy * win.width + wx] : sampleBilinear(win, wxf, wyf);
        if (dn === 0) {
          nodata = true;
          break;
        }
        bandsRaw[key] = key === "scl" ? dn : dn / 10000;
      }
      if (nodata) {
        out[idx + 3] = 0;
        continue;
      }
      const [r, g, b] = renderPixel(mode, bandsRaw);
      out[idx] = r;
      out[idx + 1] = g;
      out[idx + 2] = b;
      out[idx + 3] = 255;
    }
  }
  return out;
}

function renderTileRGBA(
  scene: SceneAssets,
  mode: RenderMode,
  z: number,
  x: number,
  y: number,
  tileSize: number,
  shouldCancel?: () => boolean,
): Promise<Uint8ClampedArray> {
  const merc = tileBoundsMeters(z, x, y);
  return renderRegionRGBA(scene, mode, [merc.minX, merc.minY, merc.maxX, merc.maxY], tileSize, tileSize, shouldCancel);
}

async function rgbaToPng(rgba: Uint8ClampedArray, width: number, height: number): Promise<ArrayBuffer> {
  const imageData = new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, width, height);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D non disponible");
  ctx.putImageData(imageData, 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return blob.arrayBuffer();
}

export async function renderTilePng(
  scene: SceneAssets,
  mode: RenderMode,
  z: number,
  x: number,
  y: number,
  tileSize: number,
  shouldCancel?: () => boolean,
): Promise<ArrayBuffer> {
  const rgba = await renderTileRGBA(scene, mode, z, x, y, tileSize, shouldCancel);
  return rgbaToPng(rgba, tileSize, tileSize);
}

// Used by the high-resolution export path: same renderer, but for an
// arbitrary bbox/output size instead of a fixed 256x256 XYZ tile — lets an
// export sample the COGs directly at a resolution decoupled from whatever
// the on-screen WebGL canvas happens to be, unlike the old screen-capture
// export path (see lib/exportHighRes.ts).
export async function renderRegionPng(
  scene: SceneAssets,
  mode: RenderMode,
  bboxMerc: [minX: number, minY: number, maxX: number, maxY: number],
  outputWidth: number,
  outputHeight: number,
): Promise<ArrayBuffer> {
  const rgba = await renderRegionRGBA(scene, mode, bboxMerc, outputWidth, outputHeight);
  return rgbaToPng(rgba, outputWidth, outputHeight);
}
