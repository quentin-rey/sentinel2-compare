// Synchronizes two MapLibre maps and drives a draggable clip-path divider
// between them, replicating a georeferenced before/after swipe control.
export function createSwipe({ mapA, mapB, wrapEl, sliderEl, containerEl }) {
  let syncing = false;

  function syncCamera(from, to) {
    if (syncing) return;
    syncing = true;
    to.jumpTo({
      center: from.getCenter(),
      zoom: from.getZoom(),
      bearing: from.getBearing(),
      pitch: from.getPitch()
    });
    syncing = false;
  }

  mapA.on("move", () => syncCamera(mapA, mapB));
  mapB.on("move", () => syncCamera(mapB, mapA));

  let position = 0.5;

  function setPosition(fraction) {
    position = Math.min(1, Math.max(0, fraction));
    const pct = position * 100;
    wrapEl.style.clipPath = `inset(0 0 0 ${pct}%)`;
    sliderEl.style.left = `${pct}%`;
  }

  setPosition(0.5);

  let dragging = false;
  sliderEl.addEventListener("pointerdown", e => {
    dragging = true;
    sliderEl.setPointerCapture(e.pointerId);
  });
  sliderEl.addEventListener("pointerup", () => { dragging = false; });
  sliderEl.addEventListener("pointermove", e => {
    if (!dragging) return;
    const rect = containerEl.getBoundingClientRect();
    setPosition((e.clientX - rect.left) / rect.width);
  });

  return { setPosition, getPosition: () => position };
}
