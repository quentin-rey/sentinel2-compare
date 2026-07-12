import type { Map as MapLibreMap } from "maplibre-gl";

interface CreateSwipeOptions {
  mapA: MapLibreMap;
  mapB: MapLibreMap;
  wrapEl: HTMLElement;
  sliderEl: HTMLElement;
  containerEl: HTMLElement;
}

export interface SwipeControl {
  setPosition: (fraction: number) => void;
  getPosition: () => number;
  // Removes every listener this instance attached — must be called before
  // discarding a swipe control (a new compare run creates a fresh one on the
  // same persistent #swiper/mapA/mapB-container elements, so without this
  // each run would pile up another set of pointer/move listeners on top of
  // the previous, still-attached ones).
  destroy: () => void;
}

// Synchronizes two MapLibre maps and drives a draggable clip-path divider
// between them, replicating a georeferenced before/after swipe control.
export function createSwipe({ mapA, mapB, wrapEl, sliderEl, containerEl }: CreateSwipeOptions): SwipeControl {
  let syncing = false;

  function syncCamera(from: MapLibreMap, to: MapLibreMap) {
    if (syncing) return;
    syncing = true;
    to.jumpTo({
      center: from.getCenter(),
      zoom: from.getZoom(),
      bearing: from.getBearing(),
      pitch: from.getPitch(),
    });
    syncing = false;
  }

  const onMoveA = () => syncCamera(mapA, mapB);
  const onMoveB = () => syncCamera(mapB, mapA);
  mapA.on("move", onMoveA);
  mapB.on("move", onMoveB);

  let position = 0.5;

  function setPosition(fraction: number) {
    position = Math.min(1, Math.max(0, fraction));
    const pct = position * 100;
    wrapEl.style.clipPath = `inset(0 0 0 ${pct}%)`;
    sliderEl.style.left = `${pct}%`;
  }

  setPosition(0.5);

  let dragging = false;
  const onPointerDown = (e: PointerEvent) => {
    dragging = true;
    sliderEl.setPointerCapture(e.pointerId);
  };
  const onPointerUp = () => {
    dragging = false;
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const rect = containerEl.getBoundingClientRect();
    setPosition((e.clientX - rect.left) / rect.width);
  };
  sliderEl.addEventListener("pointerdown", onPointerDown);
  sliderEl.addEventListener("pointerup", onPointerUp);
  sliderEl.addEventListener("pointermove", onPointerMove);

  function destroy() {
    mapA.off("move", onMoveA);
    mapB.off("move", onMoveB);
    sliderEl.removeEventListener("pointerdown", onPointerDown);
    sliderEl.removeEventListener("pointerup", onPointerUp);
    sliderEl.removeEventListener("pointermove", onPointerMove);
  }

  return { setPosition, getPosition: () => position, destroy };
}
