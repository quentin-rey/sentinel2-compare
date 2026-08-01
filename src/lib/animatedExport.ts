import type { Map as MapLibreMap } from "maplibre-gl";
import { compositeCanvas, blendCanvas, drawOverlayLabels, type ExportLabels } from "./exportImage";

// "slide" (default): the same before/after sweep the on-screen comparison
// slider makes. "opacity": crossfades between the two dates instead —
// changed areas fade smoothly rather than being revealed by a moving edge
// (issue #23).
export type AnimationStyle = "slide" | "opacity";

// gif.js (https://github.com/jnordberg/gif.js) is a UMD/global-based library
// with a separate Web Worker file for encoding. Loaded lazily (only if the
// user actually exports a GIF) via a classic <script> tag rather than an ES
// import, since it attaches to `window.GIF` rather than exporting properly.
// No official types exist — this is the minimal shape this module relies on.
interface GifFrameOptions {
  delay: number;
  copy: boolean;
}
interface GifInstance {
  on(event: "progress", cb: (fraction: number) => void): void;
  on(event: "finished", cb: (blob: Blob) => void): void;
  on(event: "abort", cb: () => void): void;
  addFrame(frame: HTMLCanvasElement, options: GifFrameOptions): void;
  render(): void;
}
interface GifConstructorOptions {
  workers: number;
  quality: number;
  workerScript: string;
  width: number;
  height: number;
  globalPalette: boolean;
}
type GifConstructor = new (options: GifConstructorOptions) => GifInstance;

declare global {
  interface Window {
    GIF?: GifConstructor;
  }
}

const GIF_JS_URL = "https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.js";
const GIF_WORKER_URL = "https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js";

let gifLibPromise: Promise<GifConstructor> | null = null;
function loadGifLib(): Promise<GifConstructor> {
  if (window.GIF) return Promise.resolve(window.GIF);
  if (!gifLibPromise) {
    gifLibPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GIF_JS_URL;
      script.onload = () => resolve(window.GIF!);
      script.onerror = () => reject(new Error("Impossible de charger la librairie d'export GIF."));
      document.head.appendChild(script);
    });
  }
  return gifLibPromise;
}

// gif.js's worker is created internally via `new Worker(workerScript)`, which
// browsers block for cross-origin URLs (the CDN). Fetching the script text
// ourselves and handing gif.js a same-origin blob: URL works around that.
let workerBlobUrlPromise: Promise<string> | null = null;
function getGifWorkerBlobUrl(): Promise<string> {
  if (!workerBlobUrlPromise) {
    workerBlobUrlPromise = fetch(GIF_WORKER_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Téléchargement du worker GIF échoué (HTTP ${res.status}).`);
        return res.text();
      })
      .then((text) => URL.createObjectURL(new Blob([text], { type: "application/javascript" })));
  }
  return workerBlobUrlPromise;
}

// Fixed pause at each end of the loop — without it, the sweep/crossfade
// reverses direction the instant it reaches "before" or "after", which
// doesn't give the viewer any time to actually look at either side.
// Expressed as a fraction of the cycle (computed from the chosen duration)
// so a short loop doesn't end up spending most of its length paused.
const HOLD_MS = 450;

function holdFractionFor(durationMs: number): number {
  // Capped at 0.4 so each direction's ramp keeps at least 20% of the cycle
  // even at the shortest duration the UI allows (2s) — otherwise a short
  // enough loop could have no discernible transition left at all.
  return Math.min(0.4, HOLD_MS / durationMs);
}

// A back-and-forth sweep (0 -> 1 -> 0) that loops seamlessly (t=0 and the
// value approaching t=1 both sit at the same endpoint), holding at each
// endpoint for `holdFraction` of the cycle before ramping to the other side.
function waveWithHold(t: number, holdFraction: number): number {
  const ramp = (1 - 2 * holdFraction) / 2;
  if (t < holdFraction) return 0;
  if (t < holdFraction + ramp) return (t - holdFraction) / ramp;
  if (t < 2 * holdFraction + ramp) return 1;
  return Math.max(0, 1 - (t - 2 * holdFraction - ramp) / ramp);
}

function renderFrame(mapA: MapLibreMap, mapB: MapLibreMap, style: AnimationStyle, t: number, holdFraction: number, maxWidth: number): HTMLCanvasElement {
  const wave = waveWithHold(t, holdFraction);
  return style === "opacity" ? blendCanvas(mapA, mapB, wave, maxWidth) : compositeCanvas(mapA, mapB, wave, maxWidth);
}

function generateFrames(
  mapA: MapLibreMap,
  mapB: MapLibreMap,
  frameCount: number,
  durationMs: number,
  maxWidth: number,
  style: AnimationStyle,
  labels?: ExportLabels,
): HTMLCanvasElement[] {
  const holdFraction = holdFractionFor(durationMs);
  const frames: HTMLCanvasElement[] = [];
  for (let i = 0; i < frameCount; i++) {
    const frame = renderFrame(mapA, mapB, style, i / frameCount, holdFraction, maxWidth);
    if (labels) drawOverlayLabels(frame, { ...labels, side: "both" });
    frames.push(frame);
  }
  return frames;
}

interface ExportCompareGifOptions {
  mapA: MapLibreMap;
  mapB: MapLibreMap;
  style?: AnimationStyle;
  durationMs?: number;
  fps?: number;
  maxWidth?: number;
  quality?: number;
  labels?: ExportLabels;
  onProgress?: (fraction: number) => void;
}

/**
 * Renders a looping before/after sweep (or, with `style: "opacity"`, a
 * crossfade — see AnimationStyle) as an animated GIF, entirely in the
 * browser (encoding runs in a Web Worker). Returns a Blob (image/gif).
 *
 * `quality` is a 0-1 fraction (higher = better/heavier), matching the JPEG
 * export convention — mapped internally to gif.js's own 1-30 scale, where
 * *lower* means better quality.
 */
export async function exportCompareGif({
  mapA,
  mapB,
  style = "slide",
  durationMs = 2400,
  fps = 17,
  maxWidth = 640,
  quality = 0.7,
  labels,
  onProgress,
}: ExportCompareGifOptions): Promise<Blob> {
  const frameCount = Math.max(2, Math.round((durationMs / 1000) * fps));
  const delayMs = Math.round(1000 / fps);
  const gifQuality = Math.max(1, Math.round(31 - quality * 30));
  const [GIFCtor, workerScript] = await Promise.all([loadGifLib(), getGifWorkerBlobUrl()]);
  const frames = generateFrames(mapA, mapB, frameCount, durationMs, maxWidth, style, labels);

  return new Promise((resolve, reject) => {
    const gif = new GIFCtor({
      workers: 2,
      quality: gifQuality,
      workerScript,
      width: frames[0].width,
      height: frames[0].height,
      // Without this, gif.js quantizes each frame's palette independently —
      // for smoothly-varying satellite imagery that shows up as a visible
      // per-frame color shift ("blinking"). One shared palette fixes it.
      globalPalette: true,
    });
    gif.on("progress", (p) => onProgress?.(p));
    gif.on("finished", (blob) => resolve(blob));
    gif.on("abort", () => reject(new Error("Génération du GIF annulée.")));
    for (const frame of frames) {
      gif.addFrame(frame, { delay: delayMs, copy: true });
    }
    gif.render();
  });
}

interface ExportCompareWebmOptions {
  mapA: MapLibreMap;
  mapB: MapLibreMap;
  style?: AnimationStyle;
  durationMs?: number;
  fps?: number;
  maxWidth?: number;
  quality?: number;
  labels?: ExportLabels;
  onProgress?: (fraction: number) => void;
}

/**
 * Records a looping before/after sweep (or, with `style: "opacity"`, a
 * crossfade — see AnimationStyle) as a short WebM video using the
 * MediaRecorder API (a canvas is redrawn in real time and captured via
 * `canvas.captureStream()`). Returns a Blob (video/webm), or throws if the
 * browser doesn't support WebM recording (notably some Safari versions).
 */
export async function exportCompareWebm({
  mapA,
  mapB,
  style = "slide",
  durationMs = 3000,
  fps = 24,
  maxWidth = 640,
  quality = 0.7,
  labels,
  onProgress,
}: ExportCompareWebmOptions): Promise<Blob> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("L'enregistrement vidéo n'est pas supporté par ce navigateur.");
  }
  const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
  if (!mimeType) {
    throw new Error("L'enregistrement WebM n'est pas supporté par ce navigateur.");
  }

  const holdFraction = holdFractionFor(durationMs);
  const first = renderFrame(mapA, mapB, style, 0, holdFraction, maxWidth);
  const canvas = document.createElement("canvas");
  canvas.width = first.width;
  canvas.height = first.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(first, 0, 0);

  // quality (0-1) scaled to a 1-8 Mbps bitrate range.
  const videoBitsPerSecond = Math.round(1_000_000 + quality * 7_000_000);
  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start();

  await new Promise<void>((resolveLoop) => {
    const start = performance.now();
    function step(now: number) {
      const elapsed = now - start;
      const t = (elapsed % durationMs) / durationMs;
      const frame = renderFrame(mapA, mapB, style, t, holdFraction, maxWidth);
      if (labels) drawOverlayLabels(frame, { ...labels, side: "both" });
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(frame, 0, 0);
      onProgress?.(Math.min(1, elapsed / durationMs));
      if (elapsed < durationMs) {
        requestAnimationFrame(step);
      } else {
        resolveLoop();
      }
    }
    requestAnimationFrame(step);
  });

  recorder.stop();
  await stopped;
  return new Blob(chunks, { type: "video/webm" });
}
