// Shared "nice" scale-bar rounding, used by both the live map's scale
// control and the export canvas's drawScaleBar (exportImage.ts) — a single
// source of truth so the two always agree on the exact same distance for a
// given view, never just a plausible-looking one.
//
// Deliberately NOT MapLibre's own ScaleControl algorithm (scale_control.ts's
// getRoundNum), which allows a "3" step (1/2/3/5/10): issue #43 — a
// distance that only rounds to a factor of 3 (e.g. "3 km") doesn't read as
// a round number the way 1/2/5/10 do, so this sticks to the classic
// cartographic progression.
export function niceRoundDistance(num: number): number {
  const pow10 = Math.pow(10, String(Math.floor(num)).length - 1);
  const d = num / pow10;
  const nice = d >= 10 ? 10 : d >= 5 ? 5 : d >= 2 ? 2 : 1;
  return pow10 * nice;
}

export function formatScaleDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  const km = meters / 1000;
  return `${km % 1 === 0 ? km : km.toFixed(1)} km`;
}
