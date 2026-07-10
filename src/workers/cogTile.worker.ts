// Renders one Sentinel-2 tile off the main thread — see lib/cogRaster.ts
// for the actual COG decode/reprojection/band-math work this delegates to.
import { renderTilePng, type SceneAssets } from "../lib/cogRaster";
import type { RenderMode } from "../lib/config";

export interface CogTileRequest {
  id: number;
  scene: SceneAssets;
  mode: RenderMode;
  z: number;
  x: number;
  y: number;
}

export type CogTileResponse = { id: number; buffer: ArrayBuffer } | { id: number; error: string };

self.onmessage = async (e: MessageEvent<CogTileRequest>) => {
  const { id, scene, mode, z, x, y } = e.data;
  try {
    const buffer = await renderTilePng(scene, mode, z, x, y);
    (self as unknown as Worker).postMessage({ id, buffer } satisfies CogTileResponse, [buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies CogTileResponse);
  }
};
