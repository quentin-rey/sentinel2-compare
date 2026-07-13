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

  // Both maps have their own touch gesture handlers (pan/pinch-zoom) on the
  // exact same screen region the slider handle sits over — on iOS Safari,
  // a drag that starts on the (only 3px-wide) handle can lose the touch
  // shortly after starting as that native map gesture competes for it, even
  // with setPointerCapture. Disabling map gestures for the duration of a
  // slider drag removes that competition outright (belt-and-braces on top
  // of the handle's own `touch-action: none` in style.css, which should
  // stop the browser from ever routing the touch to a native gesture in
  // the first place).
  function setMapGesturesEnabled(enabled: boolean) {
    for (const map of [mapA, mapB]) {
      if (enabled) {
        map.dragPan.enable();
        map.touchZoomRotate.enable();
      } else {
        map.dragPan.disable();
        map.touchZoomRotate.disable();
      }
    }
  }

  let dragging = false;
  const onPointerDown = (e: PointerEvent) => {
    dragging = true;
    sliderEl.setPointerCapture(e.pointerId);
    setMapGesturesEnabled(false);
  };
  // iOS fires "pointercancel" (not "pointerup") when it decides to
  // preempt an in-progress touch gesture — e.g. an edge-swipe or the
  // system's own gesture arbitration. Only listening for "pointerup" left
  // `dragging` (and the disabled map gestures) stuck on in that case, with
  // no further pointermove ever arriving for that touch — indistinguishable
  // from the drag "losing" the finger.
  const endDrag = () => {
    dragging = false;
    setMapGesturesEnabled(true);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const rect = containerEl.getBoundingClientRect();
    setPosition((e.clientX - rect.left) / rect.width);
  };
  sliderEl.addEventListener("pointerdown", onPointerDown);
  sliderEl.addEventListener("pointerup", endDrag);
  sliderEl.addEventListener("pointercancel", endDrag);
  sliderEl.addEventListener("pointermove", onPointerMove);

  function destroy() {
    mapA.off("move", onMoveA);
    mapB.off("move", onMoveB);
    sliderEl.removeEventListener("pointerdown", onPointerDown);
    sliderEl.removeEventListener("pointerup", endDrag);
    sliderEl.removeEventListener("pointercancel", endDrag);
    sliderEl.removeEventListener("pointermove", onPointerMove);
    // In case a swipe control gets torn down mid-drag (e.g. re-running
    // "Comparer" while dragging) — don't leave the maps' own gestures
    // disabled for whatever gets built next.
    if (dragging) setMapGesturesEnabled(true);
  }

  return { setPosition, getPosition: () => position, destroy };
}
