// Exports either the composited swipe view, or just one side alone, from
// the two compare-mode MapLibre canvases. Requires both maps to be created
// with `preserveDrawingBuffer: true`, otherwise the WebGL buffer may read
// back blank.
//
// Uses toBlob() + a blob: object URL rather than toDataURL() — the
// `download` attribute on data: URIs is unreliable in Safari (it tends to
// navigate to/open the image instead of downloading it), while blob: URLs
// work consistently across browsers.
import type { Map as MapLibreMap } from "maplibre-gl";

export type ExportSide = "before" | "after" | "both";
export type ExportTarget = "slide" | "opacity" | "before" | "after";
export type ExportFormat = "png" | "jpeg";

interface ExportReadout {
  label: string;
  value: string;
}

export interface ExportLabels {
  before?: ExportReadout;
  after?: ExportReadout;
  attribution?: string;
}

export function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Le navigateur n'a pas pu générer l'image (canvas vide ou bloqué)."));
          return;
        }
        resolve(blob);
      },
      mime,
      quality,
    );
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// WebGL canvases (mapA/mapB's own canvases) can't have a 2D context opened
// on them once MapLibre has claimed a webgl one — copy the pixels into a
// plain 2D canvas first so overlay labels can be drawn on top of it.
function copyToCanvas2d(sourceCanvas: HTMLCanvasElement, maxWidth?: number): HTMLCanvasElement {
  const srcWidth = sourceCanvas.width;
  const scale = maxWidth && maxWidth < srcWidth ? maxWidth / srcWidth : 1;
  const width = Math.round(srcWidth * scale);
  const height = Math.round(sourceCanvas.height * scale);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  out.getContext("2d")!.drawImage(sourceCanvas, 0, 0, width, height);
  return out;
}

/**
 * Composites canvasA (left of the split) and canvasB (right of the split)
 * into a single canvas, matching the swipe view. `targetWidth`, if smaller
 * than canvasA's width, downscales the output (used for GIF/video frames,
 * where full resolution would be slow to encode and needlessly large).
 * Takes plain canvases rather than MapLibreMaps so it's equally usable for
 * the high-resolution direct-COG export path (lib/exportHighRes.ts), whose
 * canvases never touched a MapLibreMap at all.
 */
export function compositeCanvasesAt(
  canvasA: HTMLCanvasElement,
  canvasB: HTMLCanvasElement,
  sliderFraction: number,
  targetWidth?: number,
): HTMLCanvasElement {
  const srcWidth = canvasA.width;
  const srcHeight = canvasA.height;
  const scale = targetWidth && targetWidth < srcWidth ? targetWidth / srcWidth : 1;
  const width = Math.round(srcWidth * scale);
  const height = Math.round(srcHeight * scale);

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d")!;

  ctx.drawImage(canvasA, 0, 0, width, height);

  const splitX = Math.round(width * sliderFraction);
  if (splitX < width) {
    // Draw B scaled to the full output first, but clipped to the region
    // right of the split — avoids re-deriving separate source rects for A
    // and B at a different scale than the output.
    ctx.save();
    ctx.beginPath();
    ctx.rect(splitX, 0, width - splitX, height);
    ctx.clip();
    ctx.drawImage(canvasB, 0, 0, width, height);
    ctx.restore();
  }
  return out;
}

export function compositeCanvas(mapA: MapLibreMap, mapB: MapLibreMap, sliderFraction: number, targetWidth?: number): HTMLCanvasElement {
  return compositeCanvasesAt(mapA.getCanvas(), mapB.getCanvas(), sliderFraction, targetWidth);
}

/**
 * Overlays canvasA and canvasB at 50/50 opacity into a single canvas — the
 * "opacity" export target (issue #23): unlike the slide split, both images
 * are visible everywhere at once, which makes areas that changed show up as
 * a soft "ghosting"/double-exposure effect instead of a hard edge. Same
 * `targetWidth` downscale convention as compositeCanvasesAt.
 */
export function blendCanvasesAt(canvasA: HTMLCanvasElement, canvasB: HTMLCanvasElement, targetWidth?: number): HTMLCanvasElement {
  const srcWidth = canvasA.width;
  const srcHeight = canvasA.height;
  const scale = targetWidth && targetWidth < srcWidth ? targetWidth / srcWidth : 1;
  const width = Math.round(srcWidth * scale);
  const height = Math.round(srcHeight * scale);

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d")!;

  ctx.drawImage(canvasA, 0, 0, width, height);
  ctx.globalAlpha = 0.5;
  ctx.drawImage(canvasB, 0, 0, width, height);
  ctx.globalAlpha = 1;
  return out;
}

export function blendCanvas(mapA: MapLibreMap, mapB: MapLibreMap, targetWidth?: number): HTMLCanvasElement {
  return blendCanvasesAt(mapA.getCanvas(), mapB.getCanvas(), targetWidth);
}

// Font sizes are derived from canvas *width* (which varies less wildly than
// height across export shapes: full-res retina PNGs vs. downscaled GIF/video
// frames) and clamped to a sane absolute pixel range, so badges stay legible
// but never balloon on very large/high-DPI canvases.
function clampFont(size: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(size)));
}

// Emoji fallbacks after the monospace stack — canvas font fallback pulls
// glyphs the primary faces lack (e.g. "☁") from these instead of tofu boxes.
const MONO_FONT = `"SF Mono", "Consolas", "Menlo", monospace, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"`;

// Sharp-cornered, two-line "digital readout" box — small muted uppercase
// label line over a bold value line — styled after EUMETSAT/MTG satellite
// overlay chyrons rather than a rounded pill.
function drawReadoutBox(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  bottomY: number,
  align: "left" | "right",
  fontSize: number,
): number {
  const labelFontSize = Math.round(fontSize * 0.62);
  const paddingX = Math.round(fontSize * 0.55);
  const paddingY = Math.round(fontSize * 0.4);
  const lineGap = Math.round(fontSize * 0.3);

  ctx.font = `700 ${labelFontSize}px ${MONO_FONT}`;
  const labelText = label.toUpperCase();
  const labelWidth = label ? ctx.measureText(labelText).width : 0;
  ctx.font = `600 ${fontSize}px ${MONO_FONT}`;
  const valueWidth = ctx.measureText(value).width;

  const boxWidth = Math.max(labelWidth, valueWidth) + paddingX * 2;
  const labelHeight = label ? labelFontSize + lineGap : 0;
  const boxHeight = paddingY * 2 + labelHeight + fontSize;
  const boxX = align === "right" ? x - boxWidth : x;
  const boxY = bottomY - boxHeight;

  ctx.fillStyle = "rgba(12,12,14,0.72)";
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

  ctx.textBaseline = "top";
  let lineY = boxY + paddingY;
  if (label) {
    ctx.font = `700 ${labelFontSize}px ${MONO_FONT}`;
    ctx.fillStyle = "rgba(210,212,218,0.85)";
    ctx.fillText(labelText, boxX + paddingX, lineY);
    lineY += labelHeight;
  }
  ctx.font = `600 ${fontSize}px ${MONO_FONT}`;
  ctx.fillStyle = "#fff";
  ctx.fillText(value, boxX + paddingX, lineY);

  return boxHeight;
}

// Single-line variant for the source attribution — same sharp/dark chyron
// style, no label/value split.
function drawReadoutLine(ctx: CanvasRenderingContext2D, text: string, centerX: number, bottomY: number, fontSize: number): number {
  const paddingX = Math.round(fontSize * 0.7);
  const paddingY = Math.round(fontSize * 0.35);
  ctx.font = `600 ${fontSize}px ${MONO_FONT}`;
  const textWidth = ctx.measureText(text).width;
  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = fontSize + paddingY * 2;
  const boxX = centerX - boxWidth / 2;
  const boxY = bottomY - boxHeight;

  ctx.fillStyle = "rgba(12,12,14,0.72)";
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
  ctx.fillStyle = "rgba(225,226,230,0.92)";
  ctx.textBaseline = "top";
  ctx.fillText(text, boxX + paddingX, boxY + paddingY);

  return boxHeight;
}

/**
 * Burns the same "Avant"/"Après" info readouts shown on screen (plus a small
 * source attribution) into an exported canvas, so the image/GIF/video is
 * self-explanatory once shared outside the app. `side` picks which readouts
 * apply: "before", "after", or "both" (default). `before`/`after` are each
 * `{ label, value }` — `label` is dropped (empty string) for a single-side
 * export where "AVANT"/"APRÈS" would be redundant.
 */
export function drawOverlayLabels(
  canvas: HTMLCanvasElement,
  { before, after, attribution, side = "both" }: ExportLabels & { side?: ExportSide } = {},
): HTMLCanvasElement {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const margin = Math.max(8, Math.round(width / 80));
  const fontSize = clampFont(width / 60, 12, 18);
  const attributionFontSize = clampFont(width / 80, 9, 13);

  // All three readouts share one bottom baseline — reads as a single
  // aligned row instead of the attribution floating above the other two.
  const bottomY = height - margin;
  if ((side === "before" || side === "both") && before?.value) {
    drawReadoutBox(ctx, before.label, before.value, margin, bottomY, "left", fontSize);
  }
  if ((side === "after" || side === "both") && after?.value) {
    drawReadoutBox(ctx, after.label, after.value, width - margin, bottomY, "right", fontSize);
  }
  if (attribution) {
    drawReadoutLine(ctx, attribution, width / 2, bottomY, attributionFontSize);
  }

  return canvas;
}

interface ExportSingleImageOptions {
  map: MapLibreMap;
  format?: ExportFormat;
  filename?: string;
  labels?: ExportLabels;
  maxWidth?: number;
  quality?: number;
}

/**
 * Same idea as exportCompareImage, but for the wizard's single-image stage
 * (no second map/swipe to composite against) — issue #4. `labels`, if
 * given, should only ever populate `before` (there's no "after" side here);
 * drawOverlayLabels is called with side "before" so its label text is
 * dropped as redundant, same as a single-side compare export.
 */
export async function exportSingleImage({ map, format = "png", filename, labels, maxWidth, quality = 0.92 }: ExportSingleImageOptions): Promise<void> {
  const mime = format === "jpeg" ? "image/jpeg" : "image/png";
  const ext = format === "jpeg" ? "jpg" : "png";
  const canvas = copyToCanvas2d(map.getCanvas(), maxWidth);
  if (labels) drawOverlayLabels(canvas, { ...labels, side: "before" });
  const blob = await canvasToBlob(canvas, mime, quality);
  downloadBlob(blob, filename || `sentinel2-image.${ext}`);
}

interface ExportCompareImageOptions {
  mapA: MapLibreMap;
  mapB: MapLibreMap;
  sliderFraction: number;
  format?: ExportFormat;
  target?: ExportTarget;
  filename?: string;
  labels?: ExportLabels;
  maxWidth?: number;
  quality?: number;
}

/**
 * `target`: "slide" (composited before/after, default), "opacity" (both
 * overlaid at 50/50), "before" (mapA alone), or "after" (mapB alone).
 * `filename`, if given, overrides the default generic name. `labels`, if
 * given ({ before, after, attribution }), burns info readouts into the
 * exported image. `maxWidth`, if smaller than the native canvas, downscales
 * the output. `quality` (0-1) controls JPEG compression (ignored for PNG).
 */
export async function exportCompareImage({
  mapA,
  mapB,
  sliderFraction,
  format = "png",
  target = "slide",
  filename,
  labels,
  maxWidth,
  quality = 0.92,
}: ExportCompareImageOptions): Promise<void> {
  const mime = format === "jpeg" ? "image/jpeg" : "image/png";
  const ext = format === "jpeg" ? "jpg" : "png";

  let canvas: HTMLCanvasElement;
  let suffix: string;
  let side: ExportSide;
  if (target === "before") {
    canvas = copyToCanvas2d(mapA.getCanvas(), maxWidth);
    suffix = "avant";
    side = "before";
  } else if (target === "after") {
    canvas = copyToCanvas2d(mapB.getCanvas(), maxWidth);
    suffix = "apres";
    side = "after";
  } else if (target === "opacity") {
    canvas = blendCanvas(mapA, mapB, maxWidth);
    suffix = "opacite";
    side = "both";
  } else {
    canvas = compositeCanvas(mapA, mapB, sliderFraction, maxWidth);
    suffix = "comparaison";
    side = "both";
  }

  if (labels) drawOverlayLabels(canvas, { ...labels, side });

  const blob = await canvasToBlob(canvas, mime, quality);
  downloadBlob(blob, filename || `sentinel2-${suffix}.${ext}`);
}
