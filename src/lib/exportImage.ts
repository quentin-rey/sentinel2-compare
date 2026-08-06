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
import { niceRoundDistance, formatScaleDistance } from "./scale";

export type ExportSide = "before" | "after" | "both";
export type ExportTarget = "slide" | "before" | "after";
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
 * Crossfades canvasA into canvasB at the given `alpha` (0 = all A, 1 = all
 * B) into a single canvas — the "opacity" animation style (issue #23): an
 * alternative to the slide sweep's hard edge for GIF/WebM exports, where a
 * changed area smoothly fades between the two dates instead of being
 * revealed by a moving line. Same `targetWidth` downscale convention as
 * compositeCanvasesAt.
 */
export function blendCanvasesAt(canvasA: HTMLCanvasElement, canvasB: HTMLCanvasElement, alpha: number, targetWidth?: number): HTMLCanvasElement {
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
  ctx.globalAlpha = alpha;
  ctx.drawImage(canvasB, 0, 0, width, height);
  ctx.globalAlpha = 1;
  return out;
}

export function blendCanvas(mapA: MapLibreMap, mapB: MapLibreMap, alpha: number, targetWidth?: number): HTMLCanvasElement {
  return blendCanvasesAt(mapA.getCanvas(), mapB.getCanvas(), alpha, targetWidth);
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

export interface ExportScaleInfo {
  // Real-world meters per CSS pixel of the *source* map view (see
  // computeMetersPerCssPixel) — not yet adjusted for this specific export
  // canvas's own (possibly downscaled or independently-sized, for the
  // direct-COG high-res path) width.
  metersPerCssPixel: number;
  // CSS width (in px) of the map container the above was measured against.
  cssWidth: number;
}

/**
 * Mirrors MapLibre's own ScaleControl technique — unprojects two points a
 * fixed CSS-pixel distance apart at the container's vertical center and
 * measures the real-world distance between them (LngLat#distanceTo, a
 * haversine great-circle distance) — rather than a closed-form Web Mercator
 * formula, so it stays accurate under tilt/rotation too.
 */
export function computeMetersPerCssPixel(map: MapLibreMap): number {
  const container = map.getContainer();
  const y = container.clientHeight / 2;
  const cx = container.clientWidth / 2;
  const left = map.unproject([cx - 50, y]);
  const right = map.unproject([cx + 50, y]);
  return left.distanceTo(right) / 100;
}

/**
 * Burns a cartographic scale bar into the top-right corner of an exported
 * canvas (issue #35) — the top-left is already taken by drawWatermark, and
 * the bottom row by drawOverlayLabels' readouts. `info` describes the
 * source map view; the actual meters-per-pixel of this canvas is derived
 * from its own width, which may differ (downscaled capture, or an
 * independently-sized direct-COG high-res render).
 */
export function drawScaleBar(canvas: HTMLCanvasElement, { metersPerCssPixel, cssWidth }: ExportScaleInfo): HTMLCanvasElement {
  const metersPerPixel = (metersPerCssPixel * cssWidth) / canvas.width;
  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return canvas;

  const ctx = canvas.getContext("2d")!;
  const { width } = canvas;
  const margin = Math.max(8, Math.round(width / 80));
  const fontSize = clampFont(width / 75, 10, 15);
  // Same 100px reference MapLibre's ScaleControl uses (its default
  // maxWidth) — measured in *source* CSS pixels so the rounded distance
  // comes out identical to the live control, whatever this canvas's own
  // resolution is. The bar is then drawn at that distance's actual pixel
  // length on this canvas, which naturally stays a sane fraction of its
  // width (equivalent to ~100 CSS px scaled by the same ratio as the rest
  // of the image), even though it's rarely exactly 100px.
  const niceDistance = niceRoundDistance(100 * metersPerCssPixel);
  const barWidth = niceDistance / metersPerPixel;
  const label = formatScaleDistance(niceDistance);

  const paddingX = Math.round(fontSize * 0.55);
  const paddingY = Math.round(fontSize * 0.4);
  const barGap = Math.round(fontSize * 0.3);
  const barHeight = 3;
  const boxWidth = Math.max(barWidth, ctx.measureText(label).width) + paddingX * 2;
  const boxHeight = paddingY * 2 + fontSize + barGap + barHeight;
  const boxX = width - margin - boxWidth;
  const boxY = margin;

  ctx.font = `600 ${fontSize}px ${MONO_FONT}`;
  ctx.fillStyle = "rgba(12,12,14,0.72)";
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

  ctx.textBaseline = "top";
  ctx.fillStyle = "#fff";
  ctx.fillText(label, boxX + paddingX, boxY + paddingY);

  const barY = boxY + paddingY + fontSize + barGap + barHeight / 2;
  const barX = boxX + paddingX;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(barX, barY);
  ctx.lineTo(barX + barWidth, barY);
  ctx.moveTo(barX, barY - barHeight / 2);
  ctx.lineTo(barX, barY + barHeight / 2);
  ctx.moveTo(barX + barWidth, barY - barHeight / 2);
  ctx.lineTo(barX + barWidth, barY + barHeight / 2);
  ctx.stroke();

  return canvas;
}

const WATERMARK_TEXT = "Sentinel-2 Compare";

/**
 * Burns a small "Sentinel-2 Compare" watermark into the top-left corner of
 * an exported canvas. Unlike drawOverlayLabels (opt-in, driven by the
 * before/after date readouts), this is applied unconditionally to every
 * export so shared images/animations stay attributable regardless of the
 * user's label settings.
 */
export function drawWatermark(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d")!;
  const { width } = canvas;
  const margin = Math.max(8, Math.round(width / 80));
  const fontSize = clampFont(width / 75, 10, 15);

  ctx.font = `600 ${fontSize}px ${MONO_FONT}`;
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillText(WATERMARK_TEXT, margin + 1, margin + 1);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText(WATERMARK_TEXT, margin, margin);

  return canvas;
}

interface ExportSingleImageOptions {
  map: MapLibreMap;
  format?: ExportFormat;
  filename?: string;
  labels?: ExportLabels;
  scale?: ExportScaleInfo;
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
export async function exportSingleImage({ map, format = "png", filename, labels, scale, maxWidth, quality = 0.92 }: ExportSingleImageOptions): Promise<void> {
  const mime = format === "jpeg" ? "image/jpeg" : "image/png";
  const ext = format === "jpeg" ? "jpg" : "png";
  const canvas = copyToCanvas2d(map.getCanvas(), maxWidth);
  drawWatermark(canvas);
  if (scale) drawScaleBar(canvas, scale);
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
  scale?: ExportScaleInfo;
  maxWidth?: number;
  quality?: number;
}

/**
 * `target`: "slide" (composited before/after, default), "before" (mapA
 * alone), or "after" (mapB alone). `filename`, if given, overrides the
 * default generic name. `labels`, if given ({ before, after, attribution }),
 * burns info readouts into the exported image. `maxWidth`, if smaller than
 * the native canvas, downscales the output. `quality` (0-1) controls JPEG
 * compression (ignored for PNG).
 */
export async function exportCompareImage({
  mapA,
  mapB,
  sliderFraction,
  format = "png",
  target = "slide",
  filename,
  labels,
  scale,
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
  } else {
    canvas = compositeCanvas(mapA, mapB, sliderFraction, maxWidth);
    suffix = "comparaison";
    side = "both";
  }

  drawWatermark(canvas);
  if (scale) drawScaleBar(canvas, scale);
  if (labels) drawOverlayLabels(canvas, { ...labels, side });

  const blob = await canvasToBlob(canvas, mime, quality);
  downloadBlob(blob, filename || `sentinel2-${suffix}.${ext}`);
}
