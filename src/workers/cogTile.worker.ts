// Renders Sentinel-2 imagery off the main thread — see lib/cogRaster.ts
// for the actual COG decode/reprojection/band-math work this delegates to.
// Handles two request shapes: a fixed 256x256 XYZ tile (the normal MapLibre
// tile-protocol path, lib/cogProtocol.ts) and an arbitrary bbox/resolution
// "region" (the high-resolution direct export path, lib/exportHighRes.ts).
import { renderTilePng, renderRegionPng, type SceneAssets } from "../lib/cogRaster";
import type { RenderMode } from "../lib/config";

export interface CogTileRequest {
  kind: "tile";
  id: number;
  scene: SceneAssets;
  mode: RenderMode;
  z: number;
  x: number;
  y: number;
}

export interface CogRegionRequest {
  kind: "region";
  id: number;
  scene: SceneAssets;
  mode: RenderMode;
  bboxMerc: [minX: number, minY: number, maxX: number, maxY: number];
  outputWidth: number;
  outputHeight: number;
}

type CogRenderRequest = CogTileRequest | CogRegionRequest;
export type CogTileResponse = { id: number; buffer: ArrayBuffer } | { id: number; error: string };

self.onmessage = async (e: MessageEvent<CogRenderRequest>) => {
  const req = e.data;
  try {
    const buffer =
      req.kind === "tile" ? await renderTilePng(req.scene, req.mode, req.z, req.x, req.y) : await renderRegionPng(req.scene, req.mode, req.bboxMerc, req.outputWidth, req.outputHeight);
    (self as unknown as Worker).postMessage({ id: req.id, buffer } satisfies CogTileResponse, [buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: req.id, error: err instanceof Error ? err.message : String(err) } satisfies CogTileResponse);
  }
};
