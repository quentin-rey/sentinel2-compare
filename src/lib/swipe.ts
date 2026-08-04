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
  // True while syncCamera's jumpTo() is applying one map's camera to the
  // other — lets a caller tell a synthetic, sync-induced "moveend" (fired
  // synchronously by that jumpTo) apart from a real one caused by the
  // user's own interaction. See useCompareMaps.ts's moveend handlers.
  isSyncing: () => boolean;
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
    // jumpTo()'s internal stop() only cancels ease animations — it never
    // clears ScrollZoomHandler's own _targetZoom cache, which a wheel-zoom
    // gesture keeps between events to know where it's zooming *to*. Left
    // stale after an external jumpTo (e.g. this camera sync firing mid-
    // gesture), the next scroll on `to` fights that stale target instead of
    // starting from the zoom `to` is actually now at — reads as "stuck".
    // reset() (public on the Map instance, if not heavily documented)
    // clears it. https://github.com/maplibre/maplibre-gl-js/issues/2709
    to.scrollZoom.reset();
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
  let downTime = 0;
  let downX = 0;
  let downY = 0;
  let lastTapTime = 0;
  const onPointerDown = (e: PointerEvent) => {
    dragging = true;
    downTime = performance.now();
    downX = e.clientX;
    downY = e.clientY;
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
  // The handle's own `touch-action: none` (needed to stop the map's pinch
  // gesture stealing a drag mid-swipe) has a side effect on mobile: Safari
  // and Chrome only synthesize a "dblclick" from two taps as part of their
  // native double-tap-to-zoom handling, which touch-action: none disables
  // entirely — so onDoubleClick in CompareView never fires on a phone.
  // Detect the double-tap ourselves from two quick, near-stationary
  // touch/pen pointer sequences instead (mouse already gets dblclick fine).
  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") {
      const isTap = performance.now() - downTime < 300 && Math.hypot(e.clientX - downX, e.clientY - downY) < 10;
      if (isTap) {
        const now = performance.now();
        if (now - lastTapTime < 350) {
          setPosition(0.5);
          lastTapTime = 0;
        } else {
          lastTapTime = now;
        }
      }
    }
    endDrag();
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const rect = containerEl.getBoundingClientRect();
    setPosition((e.clientX - rect.left) / rect.width);
  };
  sliderEl.addEventListener("pointerdown", onPointerDown);
  sliderEl.addEventListener("pointerup", onPointerUp);
  sliderEl.addEventListener("pointercancel", endDrag);
  sliderEl.addEventListener("pointermove", onPointerMove);

  function destroy() {
    mapA.off("move", onMoveA);
    mapB.off("move", onMoveB);
    sliderEl.removeEventListener("pointerdown", onPointerDown);
    sliderEl.removeEventListener("pointerup", onPointerUp);
    sliderEl.removeEventListener("pointercancel", endDrag);
    sliderEl.removeEventListener("pointermove", onPointerMove);
    // In case a swipe control gets torn down mid-drag (e.g. re-running
    // "Comparer" while dragging) — don't leave the maps' own gestures
    // disabled for whatever gets built next.
    if (dragging) setMapGesturesEnabled(true);
  }

  return { setPosition, getPosition: () => position, isSyncing: () => syncing, destroy };
}
