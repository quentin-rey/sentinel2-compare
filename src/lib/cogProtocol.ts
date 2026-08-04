// Wires the client-side COG renderer (lib/cogRaster.ts, running in a pool
// of Web Workers — see workers/cogTile.worker.ts) into MapLibre as a custom
// tile protocol, replacing the old direct WMTS raster-tile URLs.
//
// Usage: call registerCogProtocol() once at startup, then register each
// resolved scene with registerScene(key, assets) before pointing a raster
// source at `s2cog://{key}/{mode}/{z}/{x}/{y}`.
import { addProtocol } from "maplibre-gl";
import type { SceneAssets } from "./cogRaster";
import type { RenderMode } from "./config";
import type { CogTileRequest, CogTileResponse, CogCancelRequest } from "../workers/cogTile.worker";

const SCENE_REGISTRY_LIMIT = 20;
const sceneRegistry = new Map<string, SceneAssets>();

export function registerScene(key: string, assets: SceneAssets): void {
  if (sceneRegistry.size >= SCENE_REGISTRY_LIMIT && !sceneRegistry.has(key)) {
    const oldest = sceneRegistry.keys().next().value;
    if (oldest !== undefined) sceneRegistry.delete(oldest);
  }
  sceneRegistry.set(key, assets);
}

// "a"/"b" identify which compare side a tile belongs to, not the scene —
// see the lane-pool comment below for why this is threaded all the way
// through the URL.
export type TileLane = "a" | "b";

export function cogTileUrl(sceneKey: string, mode: RenderMode, lane: TileLane): string {
  return `s2cog://${sceneKey}/${mode}/${lane}/{z}/{x}/{y}`;
}

// One dedicated Worker pool per compare side. A single shared pool would let
// side B's tiles queue up behind side A's — since each tile render already
// costs real wall-clock time (COG reads), that made the second image in a
// comparison look stalled even though it started loading at the same time
// as the first. Splitting by lane guarantees the two sides never compete
// for the same workers; single-image mode just leaves lane B idle.
const LANE_POOL_SIZE = Math.min(4, Math.max(2, Math.floor(((typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4) / 2)));

// Every tile is rendered client-side at a fixed pixel size (see
// cogRaster.ts's readBandWindow/pickOverview, which pick a source COG
// overview level to match it) — on a high-DPI screen (most phones, retina
// laptops) the WebGL canvas has 2-3x as many physical pixels as CSS pixels,
// so a plain 256x256 tile gets stretched across that and looks soft, only
// sharpening once the user zooms in far enough that each tile covers a
// small enough ground area for pickOverview's GSD matching to compensate on
// its own (issue #21). Rendering at devicePixelRatio resolution instead —
// the same "@2x tile" technique ordinary raster basemaps use — fixes that
// directly, without changing which {z,x,y} tiles get requested (MapLibre's
// raster source still thinks each tile is 256 "world units"; it just
// receives a higher-resolution image for it). Capped at 2x since COG data
// read/decoded per tile scales with the square of this factor, and most of
// the visible sharpening is already there by 2x.
const TILE_BASE_SIZE = 256;
const TILE_PIXEL_RATIO = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
const TILE_OUTPUT_SIZE = Math.round(TILE_BASE_SIZE * TILE_PIXEL_RATIO);
const lanePools: Record<TileLane, Worker[]> = { a: [], b: [] };
const nextWorker: Record<TileLane, number> = { a: 0, b: 0 };
let nextRequestId = 0;
const pending = new Map<number, { resolve: (buf: ArrayBuffer) => void; reject: (err: Error) => void }>();

function ensureLanePool(lane: TileLane): Worker[] {
  const pool = lanePools[lane];
  if (pool.length > 0) return pool;
  const created = Array.from({ length: LANE_POOL_SIZE }, () => {
    const worker = new Worker(new URL("../workers/cogTile.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<CogTileResponse>) => {
      const entry = pending.get(e.data.id);
      if (!entry) return;
      pending.delete(e.data.id);
      if ("error" in e.data) entry.reject(new Error(e.data.error));
      else entry.resolve(e.data.buffer);
    };
    return worker;
  });
  lanePools[lane] = created;
  return created;
}

function parseS2CogUrl(url: string): { sceneKey: string; mode: RenderMode; lane: TileLane; z: number; x: number; y: number } | null {
  const match = /^s2cog:\/\/([^/]+)\/([^/]+)\/([ab])\/(\d+)\/(\d+)\/(\d+)$/.exec(url);
  if (!match) return null;
  const [, sceneKey, mode, lane, z, x, y] = match;
  return { sceneKey, mode: mode as RenderMode, lane: lane as TileLane, z: Number(z), x: Number(x), y: Number(y) };
}

let registered = false;

export function registerCogProtocol(): void {
  if (registered) return;
  registered = true;
  addProtocol("s2cog", (params, abortController) => {
    const parsed = parseS2CogUrl(params.url);
    if (!parsed) return Promise.reject(new Error(`URL de tuile invalide: ${params.url}`));
    const scene = sceneRegistry.get(parsed.sceneKey);
    if (!scene) return Promise.reject(new Error(`Scène inconnue: ${parsed.sceneKey}`));

    // A render can fail for reasons that have nothing to do with this tile
    // specifically — e.g. one flaky request in the burst of concurrent S3
    // range requests a viewport's worth of tiles triggers at once. MapLibre
    // only auto-retries a tile it itself cancelled (state 'unloaded'); one
    // that genuinely rejects is marked 'errored' and never retried on its
    // own, which left it permanently blank. One retry here — a fresh
    // request/id, same as a real MapLibre-driven retry would send — absorbs
    // that kind of transient hiccup before it ever reaches MapLibre.
    const attempt = (attemptsLeft: number): Promise<{ data: ArrayBuffer }> =>
      new Promise((resolve, reject) => {
        const id = nextRequestId++;
        const pool = ensureLanePool(parsed.lane);
        const worker = pool[nextWorker[parsed.lane] % pool.length];
        nextWorker[parsed.lane]++;

        const onAbort = () => {
          pending.delete(id);
          // Tells the worker to bail out of this render early instead of
          // finishing it regardless — see the cancelledIds comment in
          // cogTile.worker.ts for why that matters under fast zooming.
          worker.postMessage({ kind: "cancel", id } satisfies CogCancelRequest);
          reject(new Error("Rendu de tuile annulé"));
        };
        abortController.signal.addEventListener("abort", onAbort, { once: true });

        pending.set(id, {
          resolve: (buffer) => {
            abortController.signal.removeEventListener("abort", onAbort);
            resolve({ data: buffer });
          },
          reject: (err) => {
            abortController.signal.removeEventListener("abort", onAbort);
            if (attemptsLeft > 0 && !abortController.signal.aborted) attempt(attemptsLeft - 1).then(resolve, reject);
            else reject(err);
          },
        });

        const request: CogTileRequest = { kind: "tile", id, scene, mode: parsed.mode, z: parsed.z, x: parsed.x, y: parsed.y, tileSize: TILE_OUTPUT_SIZE };
        worker.postMessage(request);
      });

    return attempt(1);
  });
}
