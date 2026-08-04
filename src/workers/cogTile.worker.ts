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
  // Output pixel size (square) — devicePixelRatio-scaled by the caller (see
  // cogProtocol.ts) so the tile actually fills a high-DPI screen's physical
  // pixels instead of getting stretched from a fixed 256x256 render.
  tileSize: number;
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

// cogProtocol.ts sends this when MapLibre aborts a tile request (e.g. it
// panned/zoomed away before the render finished) — see the cancelledIds
// comment below for why this matters.
export interface CogCancelRequest {
  kind: "cancel";
  id: number;
}

type CogRenderRequest = CogTileRequest | CogRegionRequest | CogCancelRequest;
export type CogTileResponse = { id: number; buffer: ArrayBuffer } | { id: number; error: string };

// A render's main pixel loop is synchronous and (before this) ran to
// completion no matter what — an aborted tile request's worker kept
// rendering it anyway, its result just got silently discarded once it
// finally arrived (see cogProtocol.ts's `pending` map). Under fast/repeated
// zooming, each new camera position aborts and re-requests a fresh set of
// tiles, so a lane's worker pool could fall behind under a backlog of
// already-abandoned renders — the map looks "stuck" not because anything
// is broken, but because the workers are still busy finishing tiles nobody
// wants anymore before they can start the one that's actually needed now.
// renderRegionRGBA now yields between row-chunks and checks this set, so a
// cancelled render can bail out early instead of finishing regardless.
const cancelledIds = new Set<number>();
// Cheap unbounded-growth guard for cancel messages that arrive after their
// render already finished (nothing left to delete the id on completion) —
// correctness-neutral if it clears rare still-in-flight ids at the same
// time, just a missed optimization for those.
const CANCELLED_IDS_CAP = 200;

self.onmessage = async (e: MessageEvent<CogRenderRequest>) => {
  const req = e.data;
  if (req.kind === "cancel") {
    if (cancelledIds.size >= CANCELLED_IDS_CAP) cancelledIds.clear();
    cancelledIds.add(req.id);
    return;
  }
  try {
    const shouldCancel = req.kind === "tile" ? () => cancelledIds.has(req.id) : undefined;
    const buffer =
      req.kind === "tile"
        ? await renderTilePng(req.scene, req.mode, req.z, req.x, req.y, req.tileSize, shouldCancel)
        : await renderRegionPng(req.scene, req.mode, req.bboxMerc, req.outputWidth, req.outputHeight);
    (self as unknown as Worker).postMessage({ id: req.id, buffer } satisfies CogTileResponse, [buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: req.id, error: err instanceof Error ? err.message : String(err) } satisfies CogTileResponse);
  } finally {
    cancelledIds.delete(req.id);
  }
};
