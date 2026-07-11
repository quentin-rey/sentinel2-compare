// Band-math render functions, ported from the Sentinel Hub evalscripts this
// project used to paste into a CDSE configuration (kept for reference/
// attribution in docs/evalscripts/*.js). Each function takes calibrated
// reflectance values (0..~1, occasionally higher for bright targets/clouds —
// same range Sentinel Hub's `sample.BXX` gave the original scripts) for the
// bands its mode needs, and returns an [r, g, b] triplet in 0..255.
import type { RenderMode } from "./config";

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function to255(v: number): number {
  const c = clamp01(v) * 255;
  return c < 0 ? 0 : c > 255 ? 255 : c;
}

// true-color.js: gain 2.5 on B04/B03/B02.
function trueColor(r: number, g: number, b: number): [number, number, number] {
  const gain = 2.5;
  return [to255(r * gain), to255(g * gain), to255(b * gain)];
}

// false-color.js: gain 2.5 on B08/B04/B03.
function falseColor(nir: number, r: number, g: number): [number, number, number] {
  const gain = 2.5;
  return [to255(nir * gain), to255(r * gain), to255(g * gain)];
}

// tco-l2a.js — Highlight Optimized Natural Color: contrast/highlight
// compression + saturation enhancement + sRGB gamma, ported as-is.
const HONC_MAX_R = 3.0;
const HONC_MID_R = 0.13;
const HONC_SAT = 1.2;
const HONC_GAMMA = 1.8;
const HONC_G_OFF = 0.01;
const HONC_G_OFF_POW = Math.pow(HONC_G_OFF, HONC_GAMMA);
const HONC_G_OFF_RANGE = Math.pow(1 + HONC_G_OFF, HONC_GAMMA) - HONC_G_OFF_POW;

function honcAdj(a: number, tx: number, ty: number, maxC: number): number {
  const ar = clamp01(a / maxC);
  return (ar * (ar * (tx / maxC + ty - 1) - ty)) / (ar * ((2 * tx) / maxC - 1) - tx / maxC);
}

function honcAdjGamma(b: number): number {
  return (Math.pow(b + HONC_G_OFF, HONC_GAMMA) - HONC_G_OFF_POW) / HONC_G_OFF_RANGE;
}

function honcSAdj(a: number): number {
  return honcAdjGamma(honcAdj(a, HONC_MID_R, 1, HONC_MAX_R));
}

function honcSatEnh(r: number, g: number, b: number): [number, number, number] {
  const avgS = ((r + g + b) / 3) * (1 - HONC_SAT);
  return [clamp01(avgS + r * HONC_SAT), clamp01(avgS + g * HONC_SAT), clamp01(avgS + b * HONC_SAT)];
}

function honcSRGB(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function honc(r: number, g: number, b: number): [number, number, number] {
  const [lr, lg, lb] = honcSatEnh(honcSAdj(r), honcSAdj(g), honcSAdj(b));
  return [to255(honcSRGB(lr)), to255(honcSRGB(lg)), to255(honcSRGB(lb))];
}

// wildfire.js (QuickFire v1.0.0 by Pierre Markuse, CC BY 4.0,
// https://twitter.com/Pierre_Markuse) — ported with its default toggles
// (waterHighlight, showBurnscars both off in the source). The original's
// cloud-avoidance term used a CLP (cloud probability) band that isn't a
// standard AWS/Earth Search asset; approximated here instead with the SCL
// (Scene Classification Layer) band, which is standard — SCL classes 8/9/10
// (cloud medium/high probability, thin cirrus) suppress the SWIR hotspot
// boost the same way the original's CLP threshold did, avoiding
// false-positive "hotspots" on bright clouds. See docs/evalscripts/
// wildfire.js for the original.
function fireStretch(val: number, min: number, max: number): number {
  return (val - min) / (max - min);
}

function fireSatEnh(arr: [number, number, number], s: number): [number, number, number] {
  const avg = (arr[0] + arr[1] + arr[2]) / 3;
  return [avg * (1 - s) + arr[0] * s, avg * (1 - s) + arr[1] * s, avg * (1 - s) + arr[2] * s];
}

function fireLayerBlend(
  l1: [number, number, number],
  l2: [number, number, number],
  l3: [number, number, number],
  op1: number,
  op2: number,
  op3: number,
): [number, number, number] {
  return [
    (l1[0] / 100) * op1 + (l2[0] / 100) * op2 + (l3[0] / 100) * op3,
    (l1[1] / 100) * op1 + (l2[1] / 100) * op2 + (l3[1] / 100) * op3,
    (l1[2] / 100) * op1 + (l2[2] / 100) * op2 + (l3[2] / 100) * op3,
  ];
}

function sqrtClamped(v: number): number {
  return Math.sqrt(v < 0 ? 0 : v);
}

// SCL (Scene Classification Layer) class codes that mean "cloud-like" —
// medium/high probability cloud and thin cirrus. Standing in for the
// original evalscript's `CLP < cloudAvoidanceThreshold` check.
const SCL_CLOUD_CLASSES = new Set([8, 9, 10]);

function fire(b02: number, b03: number, b04: number, b11: number, b12: number, scl: number): [number, number, number] {
  const naturalColorsCC: [number, number, number] = [sqrtClamped(b04), sqrtClamped(b03), sqrtClamped(b02)];
  const naturalColors: [number, number, number] = [2.5 * b04, 2.5 * b03, 2.5 * b02];
  const urban: [number, number, number] = [sqrtClamped(b12 * 1.2), sqrtClamped(b11 * 1.4), sqrtClamped(b04)];

  let viz = fireLayerBlend(urban, naturalColors, naturalColorsCC, 10, 40, 50);
  viz = fireSatEnh(viz, 1.1);
  viz = [fireStretch(viz[0], 0.01, 0.99), fireStretch(viz[1], 0.01, 0.99), fireStretch(viz[2], 0.01, 0.99)];

  if (!SCL_CLOUD_CLASSES.has(scl)) {
    const hsThreshold = [2.0, 1.5, 1.25, 1.0];
    const swirSum = b12 + b11;
    if (swirSum > hsThreshold[0]) viz = [0.5 * b12 + viz[0], 0.5 * b11 + viz[1], viz[2]];
    else if (swirSum > hsThreshold[1]) viz = [0.5 * b12 + viz[0], 0.2 * b11 + viz[1], viz[2]];
    else if (swirSum > hsThreshold[2]) viz = [0.5 * b12 + viz[0], 0.1 * b11 + viz[1], viz[2]];
    else if (swirSum > hsThreshold[3]) viz = [0.5 * b12 + viz[0], viz[1], viz[2]];
  }

  // NDVI/NDWI/NBR-based burn-scar/water highlighting are left out here since
  // both toggles (waterHighlight, showBurnscars) default to off upstream.
  return [to255(viz[0]), to255(viz[1]), to255(viz[2])];
}

export function renderPixel(mode: RenderMode, bands: Record<string, number>): [number, number, number] {
  switch (mode) {
    case "true-color":
      return trueColor(bands.red, bands.green, bands.blue);
    case "false-color":
      return falseColor(bands.nir, bands.red, bands.green);
    case "honc":
      return honc(bands.red, bands.green, bands.blue);
    case "fire":
      return fire(bands.blue, bands.green, bands.red, bands.swir16, bands.swir22, bands.scl);
  }
}
