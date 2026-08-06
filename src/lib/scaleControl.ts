// A drop-in replacement for maplibregl.ScaleControl (metric-only) that
// rounds to the same 1/2/5/10 progression as the export path's
// drawScaleBar (see lib/scale.ts) instead of MapLibre's own built-in
// control, which allows a "3" step — issue #43: the live scale bar and the
// exported one must always show the exact same, always-round distance.
// Reuses MapLibre's own "maplibregl-ctrl-scale" class, so it's styled
// identically to the built-in control with no extra CSS.
import type { IControl, Map as MapLibreMap } from "maplibre-gl";
import { niceRoundDistance, formatScaleDistance } from "./scale";

export class NiceScaleControl implements IControl {
  private map?: MapLibreMap;
  private container: HTMLElement;
  private readonly maxWidth: number;

  constructor(options?: { maxWidth?: number }) {
    this.maxWidth = options?.maxWidth ?? 100;
    this.container = document.createElement("div");
    this.container.className = "maplibregl-ctrl maplibregl-ctrl-scale";
  }

  onAdd(map: MapLibreMap): HTMLElement {
    this.map = map;
    map.on("move", this.update);
    this.update();
    return this.container;
  }

  onRemove(): void {
    this.container.remove();
    this.map?.off("move", this.update);
    this.map = undefined;
  }

  private update = (): void => {
    const map = this.map;
    if (!map) return;
    const y = map.getContainer().clientHeight / 2;
    const left = map.unproject([0, y]);
    const right = map.unproject([this.maxWidth, y]);
    const maxMeters = left.distanceTo(right);
    if (!Number.isFinite(maxMeters) || maxMeters <= 0) return;
    const distance = niceRoundDistance(maxMeters);
    this.container.style.width = `${this.maxWidth * (distance / maxMeters)}px`;
    this.container.innerHTML = formatScaleDistance(distance).replace(" ", "&nbsp;");
  };
}
