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
import type { CogTileRequest, CogTileResponse } from "../workers/cogTile.worker";

const SCENE_REGISTRY_LIMIT = 20;
const sceneRegistry = new Map<string, SceneAssets>();

export function registerScene(key: string, assets: SceneAssets): void {
  if (sceneRegistry.size >= SCENE_REGISTRY_LIMIT && !sceneRegistry.has(key)) {
    const oldest = sceneRegistry.keys().next().value;
    if (oldest !== undefined) sceneRegistry.delete(oldest);
  }
  sceneRegistry.set(key, assets);
}

export function cogTileUrl(sceneKey: string, mode: RenderMode): string {
  return `s2cog://${sceneKey}/${mode}/{z}/{x}/{y}`;
}

const POOL_SIZE = Math.min(4, Math.max(2, (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 2));
let workers: Worker[] = [];
let nextWorker = 0;
let nextRequestId = 0;
const pending = new Map<number, { resolve: (buf: ArrayBuffer) => void; reject: (err: Error) => void }>();

function ensureWorkers(): Worker[] {
  if (workers.length > 0) return workers;
  workers = Array.from({ length: POOL_SIZE }, () => {
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
  return workers;
}

function parseS2CogUrl(url: string): { sceneKey: string; mode: RenderMode; z: number; x: number; y: number } | null {
  const match = /^s2cog:\/\/([^/]+)\/([^/]+)\/(\d+)\/(\d+)\/(\d+)$/.exec(url);
  if (!match) return null;
  const [, sceneKey, mode, z, x, y] = match;
  return { sceneKey, mode: mode as RenderMode, z: Number(z), x: Number(x), y: Number(y) };
}

let registered = false;

export function registerCogProtocol(): void {
  if (registered) return;
  registered = true;
  addProtocol("s2cog", (params, abortController) => {
    return new Promise((resolve, reject) => {
      const parsed = parseS2CogUrl(params.url);
      if (!parsed) {
        reject(new Error(`URL de tuile invalide: ${params.url}`));
        return;
      }
      const scene = sceneRegistry.get(parsed.sceneKey);
      if (!scene) {
        reject(new Error(`Scène inconnue: ${parsed.sceneKey}`));
        return;
      }

      const id = nextRequestId++;
      const pool = ensureWorkers();
      const worker = pool[nextWorker % pool.length];
      nextWorker++;

      const onAbort = () => {
        pending.delete(id);
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
          reject(err);
        },
      });

      const request: CogTileRequest = { id, scene, mode: parsed.mode, z: parsed.z, x: parsed.x, y: parsed.y };
      worker.postMessage(request);
    });
  });
}
