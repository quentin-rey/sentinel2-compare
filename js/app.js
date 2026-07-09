import maplibregl from "maplibre-gl";
import { wmtsTileUrl, dayRange } from "./wmts.js?v=21";
import { loadSceneData, fetchDayCloudCover } from "./stacInfo.js?v=21";
import { searchPlaces } from "./geocode.js?v=21";
import { exportCompareImage, downloadBlob } from "./exportImage.js?v=21";
import { exportCompareGif, exportCompareWebm } from "./animatedExport.js?v=21";
import { createSwipe } from "./swipe.js?v=21";
import { DEFAULT_MAX_CLOUD, DEFAULT_WINDOW_DAYS } from "./config.js?v=21";

const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors"
    }
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }]
};

const urlParams = new URLSearchParams(location.search);
const initialCenter = urlParams.has("lat") && urlParams.has("lng")
  ? [Number(urlParams.get("lng")), Number(urlParams.get("lat"))]
  : [2.3522, 48.8566];
const initialZoom = urlParams.has("zoom") ? Number(urlParams.get("zoom")) : 9;

const map = new maplibregl.Map({
  container: "map",
  style: OSM_STYLE,
  center: initialCenter,
  zoom: initialZoom
});
map.addControl(new maplibregl.NavigationControl(), "top-right");

const panelEl = document.getElementById("panel");
const menuToggleBtn = document.getElementById("menu-toggle");
const infoBtn = document.getElementById("info-btn");
const shortcutsBtn = document.getElementById("shortcuts-btn");
const githubBtn = document.getElementById("github-btn");
const infoModal = document.getElementById("info-modal");
const infoModalCloseBtn = document.getElementById("info-modal-close");
const shortcutsModal = document.getElementById("shortcuts-modal");
const shortcutsModalCloseBtn = document.getElementById("shortcuts-modal-close");
const statusEl = document.getElementById("status");
const compareBtn = document.getElementById("compare-btn");
const closeBtn = document.getElementById("close-btn");
const shareBtn = document.getElementById("share-btn");
const date1Input = document.getElementById("date1");
const date2Input = document.getElementById("date2");
const modeSelect = document.getElementById("mode");
const prioritySelect = document.getElementById("priority");
const priorityHint = document.getElementById("priority-hint");
const maxCloudInput = document.getElementById("max-cloud");
const windowDaysInput = document.getElementById("window-days");
const compareEl = document.getElementById("compare");
const exportRow = document.getElementById("export-row");
const exportPngBtn = document.getElementById("export-png-btn");
const exportJpegBtn = document.getElementById("export-jpeg-btn");
const exportTargetSelect = document.getElementById("export-target");
const exportGifBtn = document.getElementById("export-gif-btn");
const exportWebmBtn = document.getElementById("export-webm-btn");
const exportProgressEl = document.getElementById("export-progress");
const exportModal = document.getElementById("export-modal");
const exportModalCloseBtn = document.getElementById("export-modal-close");
const exportDiscardModal = document.getElementById("export-discard-modal");
const exportDiscardCancelBtn = document.getElementById("export-discard-cancel");
const exportDiscardConfirmBtn = document.getElementById("export-discard-confirm");
const exportModalConfirmBtn = document.getElementById("export-modal-confirm");
const exportSizeSelect = document.getElementById("export-size");
const exportQualityRow = document.getElementById("export-quality-row");
const exportQualityInput = document.getElementById("export-quality");
const exportQualityValueEl = document.getElementById("export-quality-value");
const exportAnimationRow = document.getElementById("export-animation-row");
const exportDurationInput = document.getElementById("export-duration");
const exportDurationValueEl = document.getElementById("export-duration-value");
const exportFpsInput = document.getElementById("export-fps");
const exportFpsValueEl = document.getElementById("export-fps-value");
const exportAnimationHint = document.getElementById("export-animation-hint");
const exportFilenameInput = document.getElementById("export-filename");
const resetSliderBtn = document.getElementById("reset-slider-btn");
const themeToggleBtn = document.getElementById("theme-toggle");
const placeSearchInput = document.getElementById("place-search");
const placeResultsEl = document.getElementById("place-results");
const labelAEl = document.getElementById("label-a");
const labelBEl = document.getElementById("label-b");
const datePickerA = document.getElementById("date-picker-a");
const datePickerB = document.getElementById("date-picker-b");
const swiperEl = document.getElementById("swiper");
const toastContainer = document.getElementById("toast-container");
const compareLoadingBanner = document.getElementById("compare-loading-banner");

const today = new Date();
const oneYearAgo = new Date(today);
oneYearAgo.setFullYear(today.getFullYear() - 1);
date2Input.value = urlParams.get("d2") || today.toISOString().slice(0, 10);
date1Input.value = urlParams.get("d1") || oneYearAgo.toISOString().slice(0, 10);
if (urlParams.has("mode")) modeSelect.value = urlParams.get("mode");
if (urlParams.has("priority")) prioritySelect.value = urlParams.get("priority");
maxCloudInput.value = urlParams.get("cc") || DEFAULT_MAX_CLOUD;
windowDaysInput.value = urlParams.get("w") || DEFAULT_WINDOW_DAYS;

// "Avant" can never be after "Après" — each field's own min/max keeps the
// native date picker from even offering an invalid value, on top of the
// hard check in runCompare() below for values set some other way (URL, etc).
function syncDateBounds() {
  date1Input.max = date2Input.value || "";
  date2Input.min = date1Input.value || "";
}
syncDateBounds();
date1Input.addEventListener("change", syncDateBounds);
date2Input.addEventListener("change", syncDateBounds);

// --- Theme -------------------------------------------------------------

const THEME_KEY = "s2compare-theme";
function applyTheme(theme) {
  if (theme === "light" || theme === "dark") {
    document.documentElement.setAttribute("data-theme", theme);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  // U+FE0E forces monochrome "text" glyph rendering instead of a colorful
  // emoji, so this matches the other monochrome icon buttons (ⓘ, ?, GitHub).
  themeToggleBtn.textContent = theme === "dark" ? "☾︎" : theme === "light" ? "☀︎" : "◐︎";
  const label = theme === "dark" ? "sombre" : theme === "light" ? "clair" : "auto (système)";
  themeToggleBtn.title = `Thème : ${label} — cliquer pour changer`;
}
let currentTheme = localStorage.getItem(THEME_KEY) || "auto";
applyTheme(currentTheme);
themeToggleBtn.addEventListener("click", () => {
  currentTheme = currentTheme === "auto" ? "light" : currentTheme === "light" ? "dark" : "auto";
  localStorage.setItem(THEME_KEY, currentTheme);
  applyTheme(currentTheme);
});

// --- Collapsible menu ----------------------------------------------------

const MENU_KEY = "s2compare-menu-collapsed";
function setMenuCollapsed(collapsed) {
  panelEl.classList.toggle("collapsed", collapsed);
  menuToggleBtn.setAttribute("aria-expanded", String(!collapsed));
  localStorage.setItem(MENU_KEY, collapsed ? "1" : "0");
}
let menuCollapsed = localStorage.getItem(MENU_KEY) === "1";
setMenuCollapsed(menuCollapsed);
function toggleMenu() {
  menuCollapsed = !menuCollapsed;
  setMenuCollapsed(menuCollapsed);
}
menuToggleBtn.addEventListener("click", toggleMenu);

// --- Info & shortcuts modals ----------------------------------------------

function openInfoModal() { infoModal.classList.remove("hidden"); }
function closeInfoModal() { infoModal.classList.add("hidden"); }
infoBtn.addEventListener("click", openInfoModal);
infoModalCloseBtn.addEventListener("click", closeInfoModal);
infoModal.addEventListener("click", e => {
  if (e.target === infoModal) closeInfoModal();
});

function openShortcutsModal() { shortcutsModal.classList.remove("hidden"); }
function closeShortcutsModal() { shortcutsModal.classList.add("hidden"); }
shortcutsBtn.addEventListener("click", openShortcutsModal);
shortcutsModalCloseBtn.addEventListener("click", closeShortcutsModal);
shortcutsModal.addEventListener("click", e => {
  if (e.target === shortcutsModal) closeShortcutsModal();
});

githubBtn.addEventListener("click", () => toast("Lien GitHub à venir."));

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("status-box", !!msg);
  statusEl.classList.toggle("status-warning", !!msg && isError);
  statusEl.classList.toggle("status-info", !!msg && !isError);
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  toastContainer.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 2500);
}

function syncPriorityUI() {
  const isClosest = prioritySelect.value === "closest";
  maxCloudInput.title = isClosest
    ? "En mode \"Date la plus proche\" : préférence, pas une exclusion — si aucune date proche ne passe sous ce seuil, la date la plus proche s'affiche quand même (ex. fumée d'incendie)."
    : "";
  priorityHint.classList.toggle("hidden", isClosest);
}
prioritySelect.addEventListener("change", syncPriorityUI);
syncPriorityUI();

function setLabelLoading(labelEl, loading) {
  labelEl.querySelector(".label-spinner").classList.toggle("hidden", !loading);
}
function setLabelText(labelEl, text, title) {
  labelEl.querySelector(".label-text").textContent = text;
  labelEl.title = title || "";
}

let mapA = null;
let mapB = null;
let swipeControl = null;
// Cached info from the last successful compare, so switching render mode
// can re-request tiles for the exact same resolved scenes instantly,
// without re-running the STAC lookup or rebuilding the whole compare view.
let lastRenderState = null;

function bboxOf(mapInstance) {
  const b = mapInstance.getBounds();
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}

// The visible, correctly-sized map to read the current view from: mapA
// while a comparison is active (the underlying browsing `map` is hidden —
// display:none — and its dimensions/bounds can't be trusted while so).
function getActiveMap() {
  return mapA || map;
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Base filename shared by all export formats, e.g.
// "sentinel2_true-color_2023-06-01_vs_2024-06-23". Uses the actual resolved
// scene date (from STAC lookup) rather than the requested menu date, so the
// filename matches what's burned into the image (they can differ when the
// exact requested day had no cloud-free scene).
function buildExportBasename() {
  const mode = slug(modeSelect.value);
  const infoA = lastRenderState?.infoA;
  const infoB = lastRenderState?.infoB;
  const d1 = (infoA?.found ? infoA.bestDate : lastRenderState?.date1 || date1Input.value)?.slice(0, 10) || "avant";
  const d2 = (infoB?.found ? infoB.bestDate : lastRenderState?.date2 || date2Input.value)?.slice(0, 10) || "apres";
  return `sentinel2_${mode}_${d1}_vs_${d2}`;
}

// One network round-trip per side (not two) — loadSceneData() returns both
// the resolved "best" scene and the full list of available days together.
async function safeSceneData(bbox, date, opts) {
  try {
    return await loadSceneData(bbox, date, opts);
  } catch (err) {
    console.warn("Métadonnées STAC indisponibles:", err);
    return { info: { found: false, unknown: true }, dates: [] };
  }
}

// Populates a side's date picker with every day that has real coverage near
// the requested date, so the user can pick one themselves when the view
// spans multiple Sentinel-2 grid tiles imaged on different days (the
// "closest date" auto-pick only knows about one tile at a time and can miss
// the day that actually covers the area of interest). Hidden when there's
// nothing to choose between.
function dateOptionLabel(d, totalTiles) {
  const cloud = d.cloudCover == null ? "…" : `${d.cloudCover.toFixed(0)}%`;
  const partial = totalTiles > 1 && d.tileCount < totalTiles ? " (partiel)" : "";
  return `${formatDate(d.date)} · ${cloud} ☁${partial}`;
}

// Cloud cover isn't fetched upfront for every candidate day (see
// stacInfo.js — each lookup is its own network round-trip, and most days
// in the picker will never be looked at). Instead it's fetched lazily, only
// once the user actually opens this dropdown, in parallel for every day
// still missing it.
function attachLazyCloudLoad(selectEl, dates, totalTiles) {
  let started = false;
  const load = () => {
    if (started) return;
    started = true;
    for (const d of dates) {
      if (d.cloudCover != null) continue;
      fetchDayCloudCover(d.productId).then(cloud => {
        d.cloudCover = cloud;
        const opt = selectEl.querySelector(`option[value="${d.date}"]`);
        if (opt) opt.textContent = dateOptionLabel(d, totalTiles);
      });
    }
  };
  selectEl.addEventListener("mousedown", load, { once: true });
  selectEl.addEventListener("focus", load, { once: true });
}

function populateDatePicker(selectEl, dates, totalTiles, currentBestDate) {
  selectEl.innerHTML = "";
  if (dates.length < 2) {
    selectEl.classList.add("hidden");
    return;
  }
  const currentDay = currentBestDate?.slice(0, 10);
  for (const d of dates) {
    const opt = document.createElement("option");
    opt.value = d.date;
    opt.textContent = dateOptionLabel(d, totalTiles);
    if (d.date === currentDay) opt.selected = true;
    selectEl.appendChild(opt);
  }
  selectEl.classList.remove("hidden");
  attachLazyCloudLoad(selectEl, dates, totalTiles);
}

async function pickManualDate(side) {
  if (!mapA || !mapB || !lastRenderState) return;
  const selectEl = side === "a" ? datePickerA : datePickerB;
  const mapInstance = side === "a" ? mapA : mapB;
  const key = side === "a" ? "src-a" : "src-b";
  const labelEl = side === "a" ? labelAEl : labelBEl;
  const prefix = side === "a" ? "Avant" : "Après";
  const dateStr = selectEl.value;
  const source = mapInstance.getSource(key);
  if (!dateStr || !source) return;

  const params = { timeRange: dayRange(dateStr), maxCloud: 100, priority: "mostRecent" };
  setLabelLoading(labelEl, true);
  mapInstance.once("idle", () => setLabelLoading(labelEl, false));
  source.setTiles([wmtsTileUrl(modeSelect.value, params.timeRange, params)]);

  const dates = side === "a" ? lastRenderState.datesA : lastRenderState.datesB;
  const chosen = dates?.find(d => d.date === dateStr);
  // The lazy loader (attachLazyCloudLoad) may not have resolved yet if the
  // user picked an option very quickly — fetch directly rather than show 0%.
  if (chosen && chosen.cloudCover == null) {
    chosen.cloudCover = await fetchDayCloudCover(chosen.productId);
  }
  const updatedInfo = {
    found: true, bestDate: dateStr,
    bestCloudCover: chosen?.cloudCover ?? 0,
    tileCount: chosen?.tileCount ?? 1
  };
  if (side === "a") lastRenderState.infoA = updatedInfo; else lastRenderState.infoB = updatedInfo;
  setLabelText(
    labelEl,
    `${prefix} — ${formatDate(dateStr)} · ${(chosen?.cloudCover ?? 0).toFixed(0)}% ☁`,
    "Date choisie manuellement parmi les scènes disponibles."
  );
}
datePickerA.addEventListener("change", () => pickManualDate("a"));
datePickerB.addEventListener("change", () => pickManualDate("b"));

function formatDate(iso) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function describeScene(label, requestedDate, info) {
  if (info.unknown) return `${label}: ~${formatDate(requestedDate)} (métadonnées indisponibles, date approximative).`;
  if (!info.found) return `⚠️ ${label}: aucune image trouvée près du ${formatDate(requestedDate)}.`;
  return `${label}: ${formatDate(info.bestDate)} (nuages ${info.bestCloudCover.toFixed(0)}%, ${info.tileCount} dalle(s)).`;
}

function labelFor(prefix, requestedDate, info, opts) {
  if (info.unknown) return `${prefix} — ~${formatDate(requestedDate)}`;
  if (!info.found) return `${prefix} — aucune image`;
  const approx = opts.priority === "leastcloud" ? " ≈" : "";
  return `${prefix}${approx} — ${formatDate(info.bestDate)} · ${info.bestCloudCover.toFixed(0)}% ☁`;
}

function sceneTooltip(requestedDate, info, opts) {
  if (info.unknown) {
    return `Requête pour le ${formatDate(requestedDate)}. Métadonnées indisponibles : rendu de secours sur une fenêtre de ±${opts.windowDays}j.`;
  }
  if (!info.found) {
    return `Aucune scène trouvée dans une fenêtre de ±${opts.windowDays}j autour du ${formatDate(requestedDate)}.`;
  }
  const priorityLabel = opts.priority === "leastcloud" ? "image la moins nuageuse" : "date la plus proche";
  return `Demandé : ${formatDate(requestedDate)}. Priorité : ${priorityLabel}. Fenêtre de recherche : ±${opts.windowDays} jours.`;
}

// Resolves what TIME/MAXCC/PRIORITY to send to the WMTS for one side, given
// the STAC lookup result. Returns null when there is genuinely nothing to
// render (info.found === false and not unknown).
function resolveTimeParams(requestedDate, info, opts) {
  if (info.found) {
    return { timeRange: dayRange(info.bestDate), maxCloud: 100, priority: "mostRecent" };
  }
  if (info.unknown) {
    const target = new Date(requestedDate + "T00:00:00Z");
    const start = new Date(target.getTime() - opts.windowDays * 86400000).toISOString().slice(0, 10);
    const end = new Date(target.getTime() + opts.windowDays * 86400000).toISOString().slice(0, 10);
    return {
      timeRange: `${start}/${end}`,
      maxCloud: opts.priority === "leastcloud" ? opts.maxCloud : 100,
      priority: opts.priority === "leastcloud" ? "leastCC" : "mostRecent"
    };
  }
  return null;
}

function addCompareLayer(mapInstance, layerId, key, mode, requestedDate, info, opts) {
  const params = resolveTimeParams(requestedDate, info, opts);
  if (!params) return;
  mapInstance.addSource(key, {
    type: "raster",
    tiles: [wmtsTileUrl(mode, params.timeRange, params)],
    tileSize: 256
  });
  mapInstance.addLayer({ id: layerId, type: "raster", source: key });
}

// Swaps the render mode of an already-loaded compare side in place (no
// re-fetch of STAC metadata, no map recreation) using MapLibre's
// setTiles(), so switching between True Color / False Color / HONC / Fire
// during an active comparison is instant.
function swapLayerMode(mapInstance, key, mode, requestedDate, info, opts, labelEl) {
  const params = resolveTimeParams(requestedDate, info, opts);
  const source = mapInstance.getSource(key);
  if (!params || !source) return;
  setLabelLoading(labelEl, true);
  mapInstance.once("idle", () => setLabelLoading(labelEl, false));
  source.setTiles([wmtsTileUrl(mode, params.timeRange, params)]);
}

modeSelect.addEventListener("change", () => {
  if (!mapA || !mapB || !lastRenderState) return;
  const mode = modeSelect.value;
  swapLayerMode(mapA, "src-a", mode, lastRenderState.date1, lastRenderState.infoA, lastRenderState.opts, labelAEl);
  swapLayerMode(mapB, "src-b", mode, lastRenderState.date2, lastRenderState.infoB, lastRenderState.opts, labelBEl);
});

async function runCompare() {
  const date1 = date1Input.value;
  const date2 = date2Input.value;
  const mode = modeSelect.value;
  if (!date1 || !date2) {
    setStatus("Choisis deux dates.", true);
    return;
  }
  if (date1 > date2) {
    setStatus("La date \"avant\" doit être antérieure (ou égale) à la date \"après\".", true);
    return;
  }

  const maxCloud = Number(maxCloudInput.value) || DEFAULT_MAX_CLOUD;
  const windowDays = Number(windowDaysInput.value) || DEFAULT_WINDOW_DAYS;
  const priority = prioritySelect.value;
  const opts = { maxCloud, windowDays, priority };

  compareBtn.disabled = true;
  try {
    // Read the current view from whichever map is actually visible right
    // now (mapA if a comparison is already open, otherwise the browsing
    // map) — reusing a hidden map's bounds would be stale/zero-sized.
    const source = getActiveMap();
    const bbox = bboxOf(source);
    const center = source.getCenter();
    const zoom = source.getZoom();
    const bearing = source.getBearing();
    const pitch = source.getPitch();
    // Keep the (possibly hidden) browsing map in sync so its bounds stay
    // correct for next time, e.g. after closing the comparison or if a
    // fresh runCompare() is triggered before mapA/mapB exist again.
    map.jumpTo({ center, zoom, bearing, pitch });

    compareEl.classList.remove("hidden");
    map.getContainer().classList.add("hidden");
    closeBtn.classList.remove("hidden");

    setLabelText(labelAEl, "Avant — chargement…");
    setLabelText(labelBEl, "Après — chargement…");
    setLabelLoading(labelAEl, true);
    setLabelLoading(labelBEl, true);

    if (mapA) { mapA.remove(); mapA = null; }
    if (mapB) { mapB.remove(); mapB = null; }
    swipeControl = null;
    lastRenderState = null;

    const emptyStyle = { version: 8, sources: {}, layers: [] };
    mapA = new maplibregl.Map({
      container: "map-a", style: emptyStyle, center, zoom, bearing, pitch,
      interactive: true, preserveDrawingBuffer: true
    });
    mapB = new maplibregl.Map({
      container: "map-b", style: emptyStyle, center, zoom, bearing, pitch,
      interactive: true, preserveDrawingBuffer: true
    });

    await Promise.all([
      new Promise(r => mapA.on("load", r)),
      new Promise(r => mapB.on("load", r))
    ]);

    datePickerA.classList.add("hidden");
    datePickerB.classList.add("hidden");

    // Instant preview: render *something* right away using a wide, unpinned
    // date window (the same fallback already used when STAC metadata is
    // unavailable) instead of waiting ~5-8s on the metadata lookup before
    // any pixel appears. The exact pinned day swaps in silently once the
    // real lookup resolves, a few seconds later.
    addCompareLayer(mapA, "layer-a", "src-a", mode, date1, { unknown: true }, opts);
    addCompareLayer(mapB, "layer-b", "src-b", mode, date2, { unknown: true }, opts);
    // Loud, impossible-to-miss during the preview: both sides can briefly
    // show near-identical imagery (same wide window/mostRecent fallback)
    // before the exact requested dates are pinned, which otherwise reads as
    // "the tool picked two similar dates" rather than "still loading".
    compareLoadingBanner.classList.remove("hidden");

    swipeControl = createSwipe({
      mapA, mapB,
      wrapEl: document.getElementById("map-b-wrap"),
      sliderEl: swiperEl,
      containerEl: compareEl
    });
    exportRow.classList.remove("hidden");
    resetSliderBtn.classList.remove("hidden");

    // Spinners stay on through the preview (real pixels are already visible
    // underneath) until swapLayerMode() below pins the exact day and clears
    // them itself once those tiles settle.

    const [sceneA, sceneB] = await Promise.all([
      safeSceneData(bbox, date1, opts),
      safeSceneData(bbox, date2, opts)
    ]);
    const { info: infoA, dates: datesA } = sceneA;
    const { info: infoB, dates: datesB } = sceneB;

    // Swap the preview tiles for the exact resolved day/scene.
    swapLayerMode(mapA, "src-a", mode, date1, infoA, opts, labelAEl);
    swapLayerMode(mapB, "src-b", mode, date2, infoB, opts, labelBEl);
    compareLoadingBanner.classList.add("hidden");

    setLabelText(labelAEl, labelFor("Avant", date1, infoA, opts), sceneTooltip(date1, infoA, opts));
    setLabelText(labelBEl, labelFor("Après", date2, infoB, opts), sceneTooltip(date2, infoB, opts));
    populateDatePicker(datePickerA, datesA, infoA.tileCount || 1, infoA.bestDate);
    populateDatePicker(datePickerB, datesB, infoB.tileCount || 1, infoB.bestDate);

    lastRenderState = { date1, date2, infoA, infoB, datesA, datesB, opts };

    const hasWarning = !infoA.found || !infoB.found;
    setStatus(
      `${describeScene("Avant", date1, infoA)} ${describeScene("Après", date2, infoB)}`,
      hasWarning
    );
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Une erreur est survenue.", true);
    closeCompare();
  } finally {
    compareBtn.disabled = false;
  }
}

compareBtn.addEventListener("click", runCompare);

function closeCompare() {
  compareEl.classList.add("hidden");
  map.getContainer().classList.remove("hidden");
  map.resize();
  closeBtn.classList.add("hidden");
  exportRow.classList.add("hidden");
  resetSliderBtn.classList.add("hidden");
  datePickerA.classList.add("hidden");
  datePickerB.classList.add("hidden");
  compareLoadingBanner.classList.add("hidden");
  if (mapA) { mapA.remove(); mapA = null; }
  if (mapB) { mapB.remove(); mapB = null; }
  swipeControl = null;
  lastRenderState = null;
}

closeBtn.addEventListener("click", closeCompare);

resetSliderBtn.addEventListener("click", () => swipeControl?.setPosition(0.5));
swiperEl.addEventListener("dblclick", () => swipeControl?.setPosition(0.5));

// Info badges burned into exported images/GIF/video — derived from the
// on-screen "Avant"/"Après" labels, plus a small source attribution, so a
// shared image/animation is self-explanatory outside the app. When exporting
// a single side alone ("before"/"after"), the "Avant —"/"Après —" prefix is
// dropped from that side's badge since there's nothing left to disambiguate.
// Cloud cover is left out of exports entirely — it's a search-tuning detail
// for this app, not something worth burning permanently into a shared image.
function stripLabelPrefix(text) {
  const idx = text.indexOf("—");
  return idx === -1 ? text : text.slice(idx + 1).trim();
}
function dateOnly(value) {
  const idx = value.indexOf("·");
  return (idx === -1 ? value : value.slice(0, idx)).trim();
}

function buildExportLabels(target = "slide") {
  const modeText = modeSelect.selectedOptions[0]?.textContent || modeSelect.value;
  const rawBefore = labelAEl.querySelector(".label-text").textContent.trim();
  const rawAfter = labelBEl.querySelector(".label-text").textContent.trim();
  // On a single-side export there's nothing to disambiguate, so the
  // "AVANT"/"APRÈS" header is dropped and only the date value shows.
  const showHeader = target === "slide";
  return {
    before: { label: showHeader ? "AVANT" : "", value: dateOnly(stripLabelPrefix(rawBefore)) },
    after: { label: showHeader ? "APRÈS" : "", value: dateOnly(stripLabelPrefix(rawAfter)) },
    attribution: `Sentinel-2 (Copernicus) · ${modeText}`
  };
}

async function handleExport(format, { maxWidth, quality, filename } = {}) {
  if (!mapA || !mapB || !swipeControl) return;
  const target = exportTargetSelect.value;
  try {
    await exportCompareImage({
      mapA, mapB, sliderFraction: swipeControl.getPosition(), format, target, filename, maxWidth, quality,
      labels: buildExportLabels(target)
    });
    toast(`Image ${format.toUpperCase()} exportée.`);
  } catch (err) {
    console.error(err);
    setStatus(`Export ${format.toUpperCase()} impossible : ${err.message}`, true);
  }
}

function setAnimatedExportBusy(busy) {
  exportGifBtn.disabled = busy;
  exportWebmBtn.disabled = busy;
  exportProgressEl.classList.toggle("hidden", !busy);
}

async function handleAnimatedExport(kind, { maxWidth, quality, durationMs, fps, filename } = {}) {
  if (!mapA || !mapB) return;
  setAnimatedExportBusy(true);
  const label = kind === "gif" ? "GIF" : "vidéo WebM";
  exportProgressEl.textContent = `Génération du ${label}… 0%`;
  try {
    let blob;
    const labels = buildExportLabels();
    const onProgress = p => { exportProgressEl.textContent = `Génération du ${label}… ${Math.round(p * 100)}%`; };
    if (kind === "gif") {
      blob = await exportCompareGif({ mapA, mapB, durationMs, fps, maxWidth, quality, labels, onProgress });
    } else {
      blob = await exportCompareWebm({ mapA, mapB, durationMs, fps, maxWidth, quality, labels, onProgress });
    }
    downloadBlob(blob, filename);
    toast(`${label} exporté(e).`);
  } catch (err) {
    console.error(err);
    setStatus(`Export ${label} impossible : ${err.message}`, true);
  } finally {
    setAnimatedExportBusy(false);
  }
}

// --- Export settings modal ------------------------------------------------
// PNG/JPEG/GIF/WebM buttons no longer export immediately: they open this
// modal so the user can pick output size, compression, animation timing,
// and review/edit the filename before the actual download starts.

const IMAGE_SIZES = [
  { label: "Originale (haute résolution)", value: 0 },
  { label: "HD (1920 px)", value: 1920 },
  { label: "Compacte (960 px)", value: 960 }
];
const ANIM_SIZES = [
  { label: "HD (960 px)", value: 960 },
  { label: "Standard (640 px)", value: 640 },
  { label: "Compacte (400 px)", value: 400 }
];

let pendingExportKind = null;
let filenameEditedByUser = false;

function isAnimatedKind(kind) {
  return kind === "gif" || kind === "webm";
}

// Filename reflects the chosen settings (size/quality/timing) so two exports
// with different trade-offs don't silently share the same name.
function currentExportFilename(kind) {
  const ext = kind === "jpeg" ? "jpg" : kind;
  const animated = isAnimatedKind(kind);
  const maxWidth = Number(exportSizeSelect.value) || 0;
  const tags = [maxWidth ? `${maxWidth}px` : "orig"];
  if (kind === "jpeg" || kind === "gif") tags.push(`q${exportQualityInput.value}`);
  if (animated) tags.push(`${exportDurationInput.value}s`, `${exportFpsInput.value}fps`);

  const base = animated
    ? `${buildExportBasename()}_animation`
    : `${buildExportBasename()}_${
        exportTargetSelect.value === "before" ? "avant" :
        exportTargetSelect.value === "after" ? "apres" : "comparaison"
      }`;
  return `${base}_${tags.join("_")}.${ext}`;
}

function refreshExportFilename() {
  if (filenameEditedByUser) return;
  exportFilenameInput.value = currentExportFilename(pendingExportKind);
}

function updateAnimationHint() {
  const duration = Number(exportDurationInput.value);
  const fps = Number(exportFpsInput.value);
  exportDurationValueEl.textContent = duration;
  exportFpsValueEl.textContent = fps;
  const frameCount = Math.round(duration * fps);
  exportAnimationHint.textContent =
    `≈ ${frameCount} images générées. Plus de durée/fluidité = un rendu plus doux mais un fichier plus lourd et plus long à générer.`;
}

function openExportModal(kind) {
  pendingExportKind = kind;
  filenameEditedByUser = false;
  const animated = isAnimatedKind(kind);
  const sizes = animated ? ANIM_SIZES : IMAGE_SIZES;
  exportSizeSelect.innerHTML = "";
  for (const { label, value } of sizes) {
    const opt = document.createElement("option");
    opt.value = String(value);
    opt.textContent = label;
    exportSizeSelect.appendChild(opt);
  }
  exportSizeSelect.value = String(animated ? 640 : 0);

  const showQuality = kind === "jpeg" || kind === "gif";
  exportQualityRow.classList.toggle("hidden", !showQuality);
  exportQualityInput.value = 85;
  exportQualityValueEl.textContent = "85";

  exportAnimationRow.classList.toggle("hidden", !animated);
  exportAnimationHint.classList.toggle("hidden", !animated);
  if (animated) {
    exportDurationInput.value = kind === "gif" ? 2.4 : 3;
    exportFpsInput.value = kind === "gif" ? 17 : 20;
    updateAnimationHint();
  }

  refreshExportFilename();
  exportModal.classList.remove("hidden");
}

// Escape / click-outside ask for confirmation (an in-progress choice of
// settings + filename is easy to lose by accident); the explicit ✕ button
// stays a direct, no-confirmation close.
function closeExportModal() {
  exportModal.classList.add("hidden");
  pendingExportKind = null;
}

// A custom in-page modal instead of window.confirm() — a native confirm()
// dialog opened from a keydown handler races the Escape key's own keyup,
// which browsers deliver to the dialog and treat as an instant "Cancel"
// (so the prompt closes itself before the user can actually decide). A
// plain DOM element has no such native-dialog/keyboard interaction quirk.
function requestCloseExportModal() {
  if (exportModal.classList.contains("hidden")) return;
  exportDiscardModal.classList.remove("hidden");
}
function cancelDiscardExport() {
  exportDiscardModal.classList.add("hidden");
}
function confirmDiscardExport() {
  exportDiscardModal.classList.add("hidden");
  closeExportModal();
}
exportDiscardCancelBtn.addEventListener("click", cancelDiscardExport);
exportDiscardConfirmBtn.addEventListener("click", confirmDiscardExport);
exportDiscardModal.addEventListener("click", e => {
  if (e.target === exportDiscardModal) cancelDiscardExport();
});

exportPngBtn.addEventListener("click", () => openExportModal("png"));
exportJpegBtn.addEventListener("click", () => openExportModal("jpeg"));
exportGifBtn.addEventListener("click", () => openExportModal("gif"));
exportWebmBtn.addEventListener("click", () => openExportModal("webm"));

exportSizeSelect.addEventListener("change", refreshExportFilename);
exportQualityInput.addEventListener("input", () => {
  exportQualityValueEl.textContent = exportQualityInput.value;
  refreshExportFilename();
});
exportDurationInput.addEventListener("input", () => { updateAnimationHint(); refreshExportFilename(); });
exportFpsInput.addEventListener("input", () => { updateAnimationHint(); refreshExportFilename(); });
exportFilenameInput.addEventListener("input", () => { filenameEditedByUser = true; });

exportModalCloseBtn.addEventListener("click", closeExportModal);
exportModal.addEventListener("click", e => {
  if (e.target === exportModal) requestCloseExportModal();
});

exportModalConfirmBtn.addEventListener("click", () => {
  const kind = pendingExportKind;
  if (!kind) return;
  const maxWidth = Number(exportSizeSelect.value) || undefined;
  const quality = Number(exportQualityInput.value) / 100;
  const filename = exportFilenameInput.value.trim() || currentExportFilename(kind);
  closeExportModal();
  if (kind === "png" || kind === "jpeg") {
    handleExport(kind, { maxWidth, quality, filename });
  } else {
    const durationMs = Number(exportDurationInput.value) * 1000;
    const fps = Number(exportFpsInput.value);
    handleAnimatedExport(kind, { maxWidth, quality, durationMs, fps, filename });
  }
});

shareBtn.addEventListener("click", async () => {
  const activeMap = getActiveMap();
  const center = activeMap.getCenter();
  const params = new URLSearchParams({
    lat: center.lat.toFixed(5),
    lng: center.lng.toFixed(5),
    zoom: activeMap.getZoom().toFixed(2),
    d1: date1Input.value,
    d2: date2Input.value,
    mode: modeSelect.value,
    priority: prioritySelect.value,
    cc: maxCloudInput.value,
    w: windowDaysInput.value
  });
  const shareUrl = `${location.origin}${location.pathname}?${params.toString()}`;
  try {
    await navigator.clipboard.writeText(shareUrl);
    toast("Lien de partage copié dans le presse-papiers.");
  } catch {
    setStatus(shareUrl);
  }
});

document.querySelectorAll(".quick-date-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const days = Number(btn.dataset.days);
    const base = date2Input.value ? new Date(date2Input.value + "T00:00:00Z") : new Date();
    base.setUTCDate(base.getUTCDate() - days);
    date1Input.value = base.toISOString().slice(0, 10);
  });
});

let searchTimeout = null;
placeSearchInput.addEventListener("input", () => {
  clearTimeout(searchTimeout);
  const query = placeSearchInput.value;
  if (query.trim().length < 3) {
    placeResultsEl.classList.add("hidden");
    placeResultsEl.innerHTML = "";
    return;
  }
  searchTimeout = setTimeout(async () => {
    try {
      const results = await searchPlaces(query);
      renderPlaceResults(results);
    } catch (err) {
      console.warn("Recherche de lieu indisponible:", err);
    }
  }, 450);
});

function renderPlaceResults(results) {
  placeResultsEl.innerHTML = "";
  if (!results.length) {
    placeResultsEl.classList.add("hidden");
    return;
  }
  for (const r of results) {
    const li = document.createElement("li");
    li.textContent = r.label;
    li.addEventListener("click", () => {
      const target = getActiveMap();
      const wasComparing = !!mapA;

      function refreshAfterMove() {
        if (wasComparing && lastRenderState) {
          runCompare();
        }
      }
      target.once("moveend", refreshAfterMove);

      if (r.boundingBox) {
        const [south, north, west, east] = r.boundingBox;
        target.fitBounds([[west, south], [east, north]], { padding: 20 });
      } else {
        target.flyTo({ center: [r.lon, r.lat], zoom: 11 });
      }
      placeResultsEl.classList.add("hidden");
      placeSearchInput.value = r.label;
    });
    placeResultsEl.appendChild(li);
  }
  placeResultsEl.classList.remove("hidden");
}

document.addEventListener("click", e => {
  if (!placeResultsEl.contains(e.target) && e.target !== placeSearchInput) {
    placeResultsEl.classList.add("hidden");
  }
});

function isFormField(el) {
  return ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName);
}

document.addEventListener("keydown", e => {
  if (!exportDiscardModal.classList.contains("hidden")) {
    if (e.key === "Escape") cancelDiscardExport();
    return;
  }
  if (!exportModal.classList.contains("hidden")) {
    if (e.key === "Escape") requestCloseExportModal();
    return;
  }
  if (!infoModal.classList.contains("hidden") || !shortcutsModal.classList.contains("hidden")) {
    if (e.key === "Escape") {
      closeInfoModal();
      closeShortcutsModal();
    }
    return;
  }

  if (e.key.toLowerCase() === "m" && !isFormField(e.target)) {
    toggleMenu();
    return;
  }

  if (compareEl.classList.contains("hidden")) return;
  if (e.key === "Escape") {
    closeCompare();
    return;
  }
  if (isFormField(e.target) || !swipeControl) return;
  const step = e.shiftKey ? 0.1 : 0.02;
  if (e.key === "ArrowLeft") {
    swipeControl.setPosition(swipeControl.getPosition() - step);
    e.preventDefault();
  } else if (e.key === "ArrowRight") {
    swipeControl.setPosition(swipeControl.getPosition() + step);
    e.preventDefault();
  }
});

if (urlParams.has("d1") && urlParams.has("d2")) {
  map.on("load", () => runCompare());
}
