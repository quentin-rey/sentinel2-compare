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

const TILE_SIZE = 256;
const EARTH_RADIUS = 6378137;
const ORIGIN_SHIFT = Math.PI * EARTH_RADIUS;
const WEB_MERCATOR = "EPSG:3857";

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
    cached = fromUrl(href);
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
    cached = getTiff(href).then(async (tiff) => (await tiff.getImage(0)).getBoundingBox() as [number, number, number, number]);
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
    // Keep picking coarser levels as long as they're still fine enough —
    // avoids downloading full 10m data for a zoomed-out view.
    if (gsd <= targetGsd * 1.3 || i === 0) best = i;
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

  const cacheKey = `${href}|${index}|${left}|${top}|${right}|${bottom}`;
  let cached = windowCache.get(cacheKey);
  if (!cached) {
    cached = (async () => {
      const windowBboxUtm: [number, number, number, number] = [
        bLeft + left / pxPerMx,
        bTop - bottom / pxPerMy,
        bLeft + right / pxPerMx,
        bTop - top / pxPerMy,
      ];
      try {
        const [data] = await img.readRasters({ window: [left, top, right, bottom], fillValue: 0 });
        return { data: data as unknown as ArrayLike<number>, width: right - left, height: bottom - top, bboxUtm: windowBboxUtm };
      } catch (err) {
        // Fail safe rather than fail the whole tile — an occasional corrupt
        // read (observed for near-edge windows) degrades to "no data" for
        // just this band/window instead of leaving the tile permanently
        // blank/erroring.
        console.warn("Lecture de fenêtre COG échouée, traitée comme absente:", href, err);
        // width/height 0 makes every pixel's bounds check fail below, i.e.
        // this band reads as nodata everywhere for this tile.
        return { data: new Uint16Array(0), width: 0, height: 0, bboxUtm: windowBboxUtm };
      }
    })();
    if (windowCache.size >= WINDOW_CACHE_LIMIT) {
      const oldest = windowCache.keys().next().value;
      if (oldest !== undefined) windowCache.delete(oldest);
    }
    windowCache.set(cacheKey, cached);
  }
  return cached;
}

export async function renderTileRGBA(scene: SceneAssets, mode: RenderMode, z: number, x: number, y: number): Promise<Uint8ClampedArray> {
  const bandKeys = RENDER_MODE_BANDS[mode];
  const utmDef = utmDefFor(scene.epsg);
  const merc = tileBoundsMeters(z, x, y);

  const corners: [number, number][] = [
    [merc.minX, merc.minY],
    [merc.maxX, merc.minY],
    [merc.minX, merc.maxY],
    [merc.maxX, merc.maxY],
  ].map((c) => proj4(WEB_MERCATOR, utmDef, c) as [number, number]);
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const pad = (Math.max(...xs) - Math.min(...xs)) * 0.05;
  const utmBbox: [number, number, number, number] = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
  const targetGsd = (merc.maxX - merc.minX) / TILE_SIZE;

  // Most tiles in a typical (zoomed-out) viewport fall entirely outside the
  // ~110km scene footprint — skip reading every band entirely for those
  // instead of paying for N wasted COG reads just to find out.
  const firstHref = scene.assets[bandKeys[0]];
  if (firstHref) {
    const sceneBbox = await getSceneBbox(firstHref);
    if (!hasMeaningfulOverlap(utmBbox, sceneBbox, targetGsd)) {
      return new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4);
    }
  }

  const entries = await Promise.all(
    bandKeys.map(async (key) => {
      const href = scene.assets[key];
      if (!href) throw new Error(`Asset manquant pour la bande "${key}"`);
      return [key, await readBandWindow(href, targetGsd, utmBbox)] as const;
    }),
  );
  const windows: Record<string, BandWindow> = Object.fromEntries(entries);

  const out = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4);
  const bandsRaw: Record<string, number> = {};
  for (let py = 0; py < TILE_SIZE; py++) {
    const my = merc.maxY - ((py + 0.5) / TILE_SIZE) * (merc.maxY - merc.minY);
    for (let px = 0; px < TILE_SIZE; px++) {
      const mx = merc.minX + ((px + 0.5) / TILE_SIZE) * (merc.maxX - merc.minX);
      const [ux, uy] = proj4(WEB_MERCATOR, utmDef, [mx, my]) as [number, number];
      const idx = (py * TILE_SIZE + px) * 4;

      let nodata = false;
      for (const key of bandKeys) {
        const win = windows[key];
        const [wl, wb, wr, wt] = win.bboxUtm;
        const wx = Math.floor(((ux - wl) / (wr - wl)) * win.width);
        const wy = Math.floor(((wt - uy) / (wt - wb)) * win.height);
        if (wx < 0 || wx >= win.width || wy < 0 || wy >= win.height) {
          nodata = true;
          break;
        }
        const dn = win.data[wy * win.width + wx];
        if (dn === 0) {
          nodata = true;
          break;
        }
        bandsRaw[key] = dn / 10000;
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

export async function renderTilePng(scene: SceneAssets, mode: RenderMode, z: number, x: number, y: number): Promise<ArrayBuffer> {
  const rgba = await renderTileRGBA(scene, mode, z, x, y);
  const imageData = new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, TILE_SIZE, TILE_SIZE);
  const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D non disponible");
  ctx.putImageData(imageData, 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return blob.arrayBuffer();
}
