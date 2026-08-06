import { describe, expect, it } from "vitest";
import { formatScaleDistance, niceRoundDistance } from "./scale";

// Independent reference for what the live scale bar's own technique
// (unproject() two points + LngLat#distanceTo, see scaleControl.ts and
// exportImage.ts's computeMetersPerCssPixel) actually measures: MapLibre's
// 256px-tile world-circumference formula, using the SAME mean-Earth-radius
// constant LngLat#distanceTo's haversine uses internally (6371008.8 —
// node_modules/maplibre-gl/src/geo/lng_lat.ts's `earthRadius`), not the
// 6378137 "Web Mercator" constant most closed-form tile-resolution formulas
// online use — that one would silently disagree with what this app (and
// MapLibre's own built-in ScaleControl, which uses the same distanceTo
// technique) actually displays, by ~0.1%.
const EARTH_RADIUS_M = 6371008.8;
function referenceMetersPerPixel(zoom: number, latDeg: number): number {
  const worldCircumferenceM = 2 * Math.PI * EARTH_RADIUS_M;
  return (worldCircumferenceM * Math.cos((latDeg * Math.PI) / 180)) / (256 * 2 ** zoom);
}

describe("niceRoundDistance", () => {
  it("only ever returns a 1/2/5/10 × 10^n value (issue #43 — no '3' step)", () => {
    for (let n = 1; n < 5_000_000; n = Math.ceil(n * 1.17)) {
      const rounded = niceRoundDistance(n);
      const pow10 = Math.pow(10, String(Math.floor(rounded)).length - 1);
      expect([1, 2, 5, 10]).toContain(rounded / pow10);
    }
  });

  it("matches MapLibre's actual on-screen resolution for real map views", () => {
    // zoom/lat combinations spread across the range a user could plausibly
    // be looking at — including the exact Paris view (zoom 11.3) that
    // originally showed the "3 km" issue #43 reported.
    const cases: Array<[zoom: number, latDeg: number, expectedMeters: number]> = [
      [11.3, 48.8566, 2000],
      [14, 48.8566, 500],
      [5, 0, 200000],
      [16, 60, 100],
      [8, -33.87, 50000],
      [3, 51.5, 1000000],
    ];
    for (const [zoom, latDeg, expectedMeters] of cases) {
      const metersPerCssPixel = referenceMetersPerPixel(zoom, latDeg);
      // Same 100px reference maxWidth scaleControl.ts / drawScaleBar use.
      expect(niceRoundDistance(100 * metersPerCssPixel)).toBe(expectedMeters);
    }
  });
});

describe("formatScaleDistance", () => {
  it("stays in meters below 1000, switches to km at/above it", () => {
    expect(formatScaleDistance(500)).toBe("500 m");
    expect(formatScaleDistance(1000)).toBe("1 km");
    expect(formatScaleDistance(2000)).toBe("2 km");
  });

  it("shows one decimal for a non-integer km value", () => {
    expect(formatScaleDistance(1500)).toBe("1.5 km");
  });
});
