// High-resolution PNG/JPEG export sampled directly from the Sentinel-2 COGs
// (lib/cogRaster.ts), at a resolution decoupled from whatever the on-screen
// WebGL canvas happens to be — unlike lib/exportImage.ts's normal export,
// which just reads back the canvas MapLibre already rendered on screen (so
// it's capped at that resolution).
//
// Only supports a north-up, unpitched view: the renderer samples an
// axis-aligned Web Mercator bbox into a plain grid, which can't reproduce a
// rotated/tilted camera the way reading back the actual WebGL framebuffer
// can. Callers should fall back to the normal capture export when
// bearing/pitch aren't both zero — see App.tsx's handleExportConfirm.
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import type { SceneAssets } from "./cogRaster";
import type { RenderMode } from "./config";
import type { CogRegionRequest, CogTileResponse } from "../workers/cogTile.worker";
import {
  compositeCanvasesAt,
  drawOverlayLabels,
  canvasToBlob,
  downloadBlob,
  type ExportFormat,
  type ExportTarget,
  type ExportLabels,
  type ExportSide,
} from "./exportImage";

const EARTH_RADIUS = 6378137;
const WORLD_SIZE = 2 * Math.PI * EARTH_RADIUS;

// Same "EPSG:3857 meters" convention lib/cogRaster.ts's tileBoundsMeters
// uses, derived via MapLibre's own MercatorCoordinate rather than
// reimplementing the lon/lat -> Web Mercator projection by hand.
function bboxMercOfView(map: MapLibreMap): [number, number, number, number] {
  const bounds = map.getBounds();
  const nw = maplibregl.MercatorCoordinate.fromLngLat(bounds.getNorthWest());
  const se = maplibregl.MercatorCoordinate.fromLngLat(bounds.getSouthEast());
  const minX = (nw.x - 0.5) * WORLD_SIZE;
  const maxX = (se.x - 0.5) * WORLD_SIZE;
  const maxY = (0.5 - nw.y) * WORLD_SIZE;
  const minY = (0.5 - se.y) * WORLD_SIZE;
  return [minX, minY, maxX, maxY];
}

let nextRequestId = 0;

// One-off Worker per call rather than reusing lib/cogProtocol.ts's tile
// pool — high-res exports are rare, explicit, and heavy (a whole viewport
// at export resolution, not a 256x256 tile), so they shouldn't compete
// with in-progress pan/zoom tile rendering for the same workers.
function renderRegionOnWorker(
  scene: SceneAssets,
  mode: RenderMode,
  bboxMerc: [number, number, number, number],
  outputWidth: number,
  outputHeight: number,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/cogTile.worker.ts", import.meta.url), { type: "module" });
    const id = nextRequestId++;
    worker.onmessage = (e: MessageEvent<CogTileResponse>) => {
      worker.terminate();
      if ("error" in e.data) reject(new Error(e.data.error));
      else resolve(e.data.buffer);
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "Échec du rendu haute résolution"));
    };
    const request: CogRegionRequest = { kind: "region", id, scene, mode, bboxMerc, outputWidth, outputHeight };
    worker.postMessage(request);
  });
}

async function renderHighResCanvas(map: MapLibreMap, scene: SceneAssets, mode: RenderMode, outputWidth: number): Promise<HTMLCanvasElement> {
  const bboxMerc = bboxMercOfView(map);
  const srcCanvas = map.getCanvas();
  const outputHeight = Math.round(outputWidth * (srcCanvas.height / srcCanvas.width));
  const buffer = await renderRegionOnWorker(scene, mode, bboxMerc, outputWidth, outputHeight);
  const bitmap = await createImageBitmap(new Blob([buffer], { type: "image/png" }));
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

export interface ExportHighResOptions {
  mapA: MapLibreMap;
  mapB: MapLibreMap;
  // Assets for the scene currently shown on each side — undefined if that
  // side's exact scene couldn't be resolved (e.g. metadata lookup failed);
  // only the side(s) actually needed for `target` must be provided.
  sceneA?: SceneAssets;
  sceneB?: SceneAssets;
  mode: RenderMode;
  sliderFraction: number;
  format?: ExportFormat;
  target?: ExportTarget;
  filename?: string;
  labels?: ExportLabels;
  outputWidth: number;
  quality?: number;
}

export async function exportHighResCompareImage({
  mapA,
  mapB,
  sceneA,
  sceneB,
  mode,
  sliderFraction,
  format = "png",
  target = "slide",
  filename,
  labels,
  outputWidth,
  quality = 0.92,
}: ExportHighResOptions): Promise<void> {
  const mime = format === "jpeg" ? "image/jpeg" : "image/png";
  const ext = format === "jpeg" ? "jpg" : "png";

  let canvas: HTMLCanvasElement;
  let suffix: string;
  let side: ExportSide;
  if (target === "before") {
    if (!sceneA) throw new Error("Scène « avant » non résolue — export haute résolution impossible.");
    canvas = await renderHighResCanvas(mapA, sceneA, mode, outputWidth);
    suffix = "avant";
    side = "before";
  } else if (target === "after") {
    if (!sceneB) throw new Error("Scène « après » non résolue — export haute résolution impossible.");
    canvas = await renderHighResCanvas(mapB, sceneB, mode, outputWidth);
    suffix = "apres";
    side = "after";
  } else {
    if (!sceneA || !sceneB) throw new Error("Scènes non résolues — export haute résolution impossible.");
    const [canvasA, canvasB] = await Promise.all([renderHighResCanvas(mapA, sceneA, mode, outputWidth), renderHighResCanvas(mapB, sceneB, mode, outputWidth)]);
    canvas = compositeCanvasesAt(canvasA, canvasB, sliderFraction);
    suffix = "comparaison";
    side = "both";
  }

  if (labels) drawOverlayLabels(canvas, { ...labels, side });

  const blob = await canvasToBlob(canvas, mime, quality);
  downloadBlob(blob, filename || `sentinel2-${suffix}-hd.${ext}`);
}
