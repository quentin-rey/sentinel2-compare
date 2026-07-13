import { useEffect, useMemo, useRef, useState } from "react";
import { useBaseMap } from "./hooks/useBaseMap";
import { useCompareMaps, type CompareOpts, type CompareView as CompareViewParams } from "./hooks/useCompareMaps";
import { useTheme } from "./hooks/useTheme";
import { useMenuCollapsed } from "./hooks/useMenuCollapsed";
import { useToasts } from "./hooks/useToasts";
import { useGeocodeSearch } from "./hooks/useGeocodeSearch";
import { useTranslation } from "./hooks/useLanguage";
import { DEFAULT_MAX_CLOUD, DEFAULT_WINDOW_DAYS, type RenderMode } from "./lib/config";
import type { ScenePriority, Bbox } from "./lib/earthSearch";
import { getSceneAssets } from "./lib/earthSearch";
import type { PlaceResult } from "./lib/geocode";
import { exportCompareImage, exportSingleImage, downloadBlob, type ExportLabels } from "./lib/exportImage";
import { exportHighResCompareImage, exportHighResSingleImage } from "./lib/exportHighRes";
import type { SceneAssets } from "./lib/cogRaster";
import { exportCompareGif, exportCompareWebm } from "./lib/animatedExport";
import { slug, stripLabelPrefix, dateOnly } from "./utils/format";
import { CompareView } from "./components/CompareView";
import { Navbar } from "./components/Navbar";
import { PlaceSearchSection } from "./components/PlaceSearchSection";
import { LayersSection } from "./components/LayersSection";
import {
  addDepartementsLayer,
  removeDepartementsLayer,
  setDepartementsOpacity as applyDepartementsOpacity,
  DEFAULT_DEPARTEMENTS_OPACITY,
  addVillesLayer,
  removeVillesLayer,
  setVillesMinPopulation as applyVillesMinPopulation,
  setVillesTextColor as applyVillesTextColor,
  setVillesHalo as applyVillesHalo,
  setVillesTextSizeScale as applyVillesTextSizeScale,
  DEFAULT_VILLES_TEXT_COLOR,
  DEFAULT_VILLES_HALO,
  DEFAULT_VILLES_SIZE_SCALE,
  refreshVilles,
} from "./lib/adminLayers";
import { CompareFormSection, type CompareStage } from "./components/CompareFormSection";
import { AccordionSection } from "./components/AccordionSection";
import { ExportSection, type ExportTarget } from "./components/ExportSection";
import { ToastContainer } from "./components/ToastContainer";
import { InfoModal } from "./components/modals/InfoModal";
import { ShortcutsModal } from "./components/modals/ShortcutsModal";
import { ExportSettingsModal, type ExportKind, type ExportConfirmOptions } from "./components/modals/ExportSettingsModal";
import { ExportDiscardConfirmModal } from "./components/modals/ExportDiscardConfirmModal";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { TranslationKey } from "./i18n/translations";

const RENDER_MODE_TEXT_KEYS: Record<RenderMode, TranslationKey> = {
  "true-color": "renderModeTrueColor",
  "false-color": "renderModeFalseColor",
  honc: "renderModeHonc",
  fire: "renderModeFire",
};

type ActiveModal = "info" | "shortcuts" | null;
type SectionId = "lieu" | "dates" | "layers" | "export" | "partage" | null;

function bboxOf(mapInstance: MapLibreMap): Bbox {
  const b = mapInstance.getBounds();
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}

function isFormField(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName);
}

export default function App() {
  // --- Initial state from the URL (read once) -----------------------------
  const initial = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(today.getFullYear() - 1);
    return {
      center: (params.has("lat") && params.has("lng")
        ? [Number(params.get("lng")), Number(params.get("lat"))]
        : [2.3522, 48.8566]) as [number, number],
      zoom: params.has("zoom") ? Number(params.get("zoom")) : 9,
      date1: params.get("d1") || oneYearAgo.toISOString().slice(0, 10),
      date2: params.get("d2") || today.toISOString().slice(0, 10),
      mode: (params.get("mode") as RenderMode) || "true-color",
      priority: (params.get("priority") as ScenePriority) || "closest",
      maxCloud: params.get("cc") || String(DEFAULT_MAX_CLOUD),
      windowDays: params.get("w") || String(DEFAULT_WINDOW_DAYS),
      showDepartements: params.get("dep") === "1",
      departementsOpacity: params.has("depOp") ? Number(params.get("depOp")) : DEFAULT_DEPARTEMENTS_OPACITY,
      showVilles: params.get("villes") === "1",
      villesMinPopulation: params.has("villesPop") ? Number(params.get("villesPop")) : 0,
      villesTextColor: params.get("villesColor") ? `#${params.get("villesColor")}` : DEFAULT_VILLES_TEXT_COLOR,
      villesHalo: params.has("villesHalo") ? params.get("villesHalo") === "1" : DEFAULT_VILLES_HALO,
      villesSizeScale: params.has("villesSize") ? Number(params.get("villesSize")) : DEFAULT_VILLES_SIZE_SCALE,
      // Distinct from merely having d1/d2 (those are always present once the
      // URL has ever been synced — see the effect below) — only restore
      // whichever of the three stages was actually active when this URL was
      // last written (by a refresh or by "Partage"), not just because date
      // params happen to be present.
      autoStage: (params.get("cmp") === "2" ? "split" : params.get("cmp") === "1" ? "single" : "idle") as CompareStage,
    };
  }, []);

  const [date1, setDate1] = useState(initial.date1);
  const [date2, setDate2] = useState(initial.date2);
  const [mode, setMode] = useState<RenderMode>(initial.mode);
  const [priority, setPriority] = useState<ScenePriority>(initial.priority);
  const [maxCloud, setMaxCloud] = useState(initial.maxCloud);
  const [windowDays, setWindowDays] = useState(initial.windowDays);
  const [exportTarget, setExportTarget] = useState<ExportTarget>("slide");
  const [status, setStatusState] = useState<{ message: string; isError: boolean }>({ message: "", isError: false });
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  // Accordion sections: mutually exclusive (classic single-open accordion)
  // — opening one collapses whichever other was open, instead of letting
  // them pile up and push each other down the narrow side panel. "Dates &
  // rendu" starts open since running a compare is the primary action;
  // "Export" auto-opens once a compare succeeds (see effect below) since
  // there's nothing to export before that.
  const [openSection, setOpenSection] = useState<SectionId>("dates");
  const [showDepartements, setShowDepartements] = useState(initial.showDepartements);
  const [departementsOpacity, setDepartementsOpacity] = useState(initial.departementsOpacity);
  const [showVilles, setShowVilles] = useState(initial.showVilles);
  const [villesMinPopulation, setVillesMinPopulation] = useState(initial.villesMinPopulation);
  const [villesTextColor, setVillesTextColor] = useState(initial.villesTextColor);
  const [villesHalo, setVillesHalo] = useState(initial.villesHalo);
  const [villesSizeScale, setVillesSizeScale] = useState(initial.villesSizeScale);
  const [pendingExportKind, setPendingExportKind] = useState<ExportKind | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [animatedBusy, setAnimatedBusy] = useState(false);
  const [progressText, setProgressText] = useState("");
  // null = indeterminate (spinner only, e.g. high-res export with no
  // meaningful sub-progress); 0-100 drives the GIF/WebM progress bar.
  const [progressPercent, setProgressPercent] = useState<number | null>(null);

  const theme = useTheme();
  const menu = useMenuCollapsed();
  const { toasts, showToast } = useToasts();
  const place = useGeocodeSearch();
  const { t } = useTranslation();

  function setStatus(message: string, isError = false) {
    setStatusState({ message, isError });
  }

  // --- Maps -----------------------------------------------------------------
  const compareBusyRef = useRef(false);
  const baseMap = useBaseMap(
    { center: initial.center, zoom: initial.zoom },
    (map) => {
      if (initial.autoStage === "split") void handleCompare(map);
      else if (initial.autoStage === "single") void handleDisplay(map);
    },
    () => syncUrlToCurrentState(),
  );
  const compareMaps = useCompareMaps({
    onMoveEnd: (map) => {
      syncUrlToCurrentState();
      if (showVilles) {
        const inst = compareMaps.instancesRef.current;
        const targets = [inst.mapA, inst.mapB].filter((m): m is MapLibreMap => m !== null);
        if (targets.length) void refreshVilles(targets, bboxOf(map), map.getZoom());
      }
    },
  });

  function getActiveMap(): MapLibreMap | null {
    return compareMaps.instancesRef.current.mapA ?? baseMap.mapRef.current;
  }

  function currentStage(): CompareStage {
    return compareMaps.isComparing ? "split" : compareMaps.isOpen ? "single" : "idle";
  }

  // Builds the same lat/lng/zoom/dates/mode/... query params used both by
  // the "Partage" link and by the continuous URL sync below, so a refresh
  // (F5) restores the exact view instead of always resetting to Paris. `cmp`
  // records whether a comparison was actually open, so reloading (or a
  // shared link) only re-runs one when that was really the case.
  function buildStateParams(map: MapLibreMap): URLSearchParams {
    const center = map.getCenter();
    const params = new URLSearchParams({
      lat: center.lat.toFixed(5),
      lng: center.lng.toFixed(5),
      zoom: map.getZoom().toFixed(2),
      d1: date1,
      mode,
      priority,
      cc: maxCloud,
      w: windowDays,
    });
    // d2 only means anything once actually comparing — omitted otherwise so
    // a restored/shared "single" session doesn't jump straight to split.
    if (compareMaps.isComparing) {
      params.set("d2", date2);
      params.set("cmp", "2");
    } else if (compareMaps.isOpen) {
      params.set("cmp", "1");
    }
    // Départements/villes overlays — only meaningful (and only ever shown
    // to the user) once a view is open, but harmless to carry along even
    // when idle so re-opening a view later restores the same look.
    if (showDepartements) {
      params.set("dep", "1");
      params.set("depOp", departementsOpacity.toFixed(2));
    }
    if (showVilles) {
      params.set("villes", "1");
      params.set("villesPop", String(villesMinPopulation));
      params.set("villesColor", villesTextColor.replace(/^#/, ""));
      params.set("villesHalo", villesHalo ? "1" : "0");
      params.set("villesSize", villesSizeScale.toFixed(2));
    }
    return params;
  }

  // Keeps the URL continuously in sync with the current view/dates/mode
  // (via replaceState, so it never adds browser-history entries) — called on
  // every map "moveend" and whenever the compare form or open/closed state
  // changes, so a plain refresh always restores the last view.
  function syncUrlToCurrentState() {
    const map = getActiveMap();
    if (!map) return;
    const params = buildStateParams(map);
    history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
  }

  useEffect(() => {
    syncUrlToCurrentState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    date1,
    date2,
    mode,
    priority,
    maxCloud,
    windowDays,
    compareMaps.isOpen,
    compareMaps.isComparing,
    showDepartements,
    departementsOpacity,
    showVilles,
    villesMinPopulation,
    villesTextColor,
    villesHalo,
    villesSizeScale,
  ]);

  async function handleCompare(preferredMap?: MapLibreMap) {
    if (compareBusyRef.current) return;
    if (!date1 || !date2) {
      setStatus(t("chooseDates"), true);
      return;
    }
    if (date1 > date2) {
      setStatus(t("dateOrderError"), true);
      return;
    }
    const source = preferredMap ?? getActiveMap();
    if (!source) return;

    compareBusyRef.current = true;
    try {
      const view: CompareViewParams = {
        center: source.getCenter(),
        zoom: source.getZoom(),
        bearing: source.getBearing(),
        pitch: source.getPitch(),
        bbox: bboxOf(source),
      };
      // Keep the (possibly hidden) browsing map in sync so its bounds stay
      // correct for next time.
      baseMap.mapRef.current?.jumpTo(view);

      const opts: CompareOpts = {
        maxCloud: Number(maxCloud) || DEFAULT_MAX_CLOUD,
        windowDays: Number(windowDays) || DEFAULT_WINDOW_DAYS,
        priority,
      };
      const result = await compareMaps.runCompare(date1, date2, mode, opts, view);
      setStatus(result.hasWarning ? result.statusMessage : "", result.hasWarning);
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : t("genericError"), true);
      compareMaps.closeCompare();
    } finally {
      compareBusyRef.current = false;
    }
  }

  // Wizard's first step — resolves just date1 into a single full-bleed
  // image (compareMaps.runSingle), no second date/slider involved yet.
  async function handleDisplay(preferredMap?: MapLibreMap) {
    if (compareBusyRef.current) return;
    if (!date1) {
      setStatus(t("chooseDate"), true);
      return;
    }
    const source = preferredMap ?? getActiveMap();
    if (!source) return;

    compareBusyRef.current = true;
    try {
      const view: CompareViewParams = {
        center: source.getCenter(),
        zoom: source.getZoom(),
        bearing: source.getBearing(),
        pitch: source.getPitch(),
        bbox: bboxOf(source),
      };
      baseMap.mapRef.current?.jumpTo(view);

      const opts: CompareOpts = {
        maxCloud: Number(maxCloud) || DEFAULT_MAX_CLOUD,
        windowDays: Number(windowDays) || DEFAULT_WINDOW_DAYS,
        priority,
      };
      const result = await compareMaps.runSingle(date1, mode, opts, view);
      setStatus(result.hasWarning ? result.statusMessage : "", result.hasWarning);
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : t("genericError"), true);
      compareMaps.closeCompare();
    } finally {
      compareBusyRef.current = false;
    }
  }

  function handleClose() {
    compareMaps.closeCompare();
  }

  // The visible "Fermer" button only appears once actually comparing (split
  // stage) — clicking it steps back to the single-image view instead of
  // resetting all the way to plain browsing (that full reset is still
  // reachable via Escape, see the keyboard shortcut below). Re-running
  // handleDisplay() with the current date1/view is the same "simple
  // reconstruction" approach already used for the single→split upgrade.
  function handleCloseToSingle() {
    void handleDisplay();
  }

  // Keep the base map's own size correct once it's shown again (it was
  // hidden — display:none via CSS — while the compare view was open, and
  // MapLibre can't measure a hidden container).
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !compareMaps.isOpen) {
      baseMap.mapRef.current?.resize();
    }
    wasOpenRef.current = compareMaps.isOpen;
  }, [compareMaps.isOpen, baseMap.mapRef]);

  // Applies the current départements/villes toggle state (and their
  // opacity/population controls) to whichever compare-mode map instances
  // currently exist. Only mapA/mapB ever get these overlays — the base
  // browsing map stays untouched, and the "Couches" section itself is only
  // shown once a view is open (see the panel JSX below), so there's nothing
  // to apply before that anyway. Re-runs on every toggle/slider change *and*
  // whenever isOpen/isComparing/mapGeneration changes — compareMaps.instancesRef
  // is a plain ref (not React state), so a fresh mapA/mapB pair built by
  // runCompare/runSingle (e.g. re-running "Comparer" with new dates while
  // already comparing, which leaves isOpen/isComparing unchanged) wouldn't
  // otherwise be noticed, and the overlays would silently vanish on reload.
  useEffect(() => {
    const maps = [compareMaps.instancesRef.current.mapA, compareMaps.instancesRef.current.mapB].filter(
      (m): m is MapLibreMap => m !== null,
    );
    for (const map of maps) {
      const apply = () => {
        if (showDepartements) void addDepartementsLayer(map, departementsOpacity).then(() => applyDepartementsOpacity(map, departementsOpacity));
        else removeDepartementsLayer(map);
        if (showVilles) {
          const isNew = addVillesLayer(map, { color: villesTextColor, halo: villesHalo, sizeScale: villesSizeScale });
          applyVillesMinPopulation(map, villesMinPopulation);
          applyVillesTextColor(map, villesTextColor);
          applyVillesHalo(map, villesHalo);
          applyVillesTextSizeScale(map, villesSizeScale);
          if (isNew) void refreshVilles([map], bboxOf(map), map.getZoom());
        } else {
          removeVillesLayer(map);
        }
      };
      if (map.isStyleLoaded()) apply();
      else map.once("load", apply);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showDepartements,
    departementsOpacity,
    showVilles,
    villesMinPopulation,
    villesTextColor,
    villesHalo,
    villesSizeScale,
    compareMaps.isOpen,
    compareMaps.isComparing,
    compareMaps.mapGeneration,
  ]);

  function handleModeChange(value: RenderMode) {
    setMode(value);
    if (compareMaps.isOpen) compareMaps.changeMode(value);
  }

  // Export has nothing to act on before a comparison succeeds — open it
  // automatically the moment one does (collapsing whichever section was
  // open), and fall back to "Dates & rendu" once the comparison closes so
  // it doesn't linger open and empty for the next session.
  useEffect(() => {
    if (compareMaps.isComparing) setOpenSection("export");
    else setOpenSection((current) => (current === "export" ? "dates" : current));
  }, [compareMaps.isComparing]);

  // --- Export -----------------------------------------------------------------

  function buildExportBasename(): string {
    const modeSlug = slug(mode);
    const infoA = compareMaps.renderStateA?.info;
    const infoB = compareMaps.renderStateB?.info;
    const d1 = (infoA?.found ? infoA.bestDate : compareMaps.renderStateA?.requestedDate || date1)?.slice(0, 10) || "avant";
    const d2 = (infoB?.found ? infoB.bestDate : compareMaps.renderStateB?.requestedDate || date2)?.slice(0, 10) || "apres";
    return `sentinel2_${modeSlug}_${d1}_vs_${d2}`;
  }

  // Single-image stage (issue #4) — just the one date, no "_vs_" pairing.
  function buildSingleExportBasename(): string {
    const modeSlug = slug(mode);
    const infoA = compareMaps.renderStateA?.info;
    const d1 = (infoA?.found ? infoA.bestDate : compareMaps.renderStateA?.requestedDate || date1)?.slice(0, 10) || "image";
    return `sentinel2_${modeSlug}_${d1}`;
  }

  function buildExportLabels(target: ExportTarget = "slide"): ExportLabels {
    const modeText = t(RENDER_MODE_TEXT_KEYS[mode]);
    const showHeader = target === "slide";
    return {
      before: { label: showHeader ? t("labelBefore").toUpperCase() : "", value: dateOnly(stripLabelPrefix(compareMaps.labelA.text)) },
      after: { label: showHeader ? t("labelAfter").toUpperCase() : "", value: dateOnly(stripLabelPrefix(compareMaps.labelB.text)) },
      attribution: `Sentinel-2 (Copernicus) · ${modeText}`,
    };
  }

  // Single-image stage: only `before` is meaningful (drawOverlayLabels is
  // called with side "before", which drops its label as redundant — same
  // as a single-side compare export).
  function buildSingleExportLabels(): ExportLabels {
    const modeText = t(RENDER_MODE_TEXT_KEYS[mode]);
    return {
      before: { label: "", value: dateOnly(stripLabelPrefix(compareMaps.labelA.text)) },
      attribution: `Sentinel-2 (Copernicus) · ${modeText}`,
    };
  }

  function computeExportFilename(kind: ExportKind, maxWidth: number, quality: number, duration: number, fps: number): string {
    const ext = kind === "jpeg" ? "jpg" : kind;
    const animated = kind === "gif" || kind === "webm";
    const tags = [maxWidth ? `${maxWidth}px` : "orig"];
    if (kind === "jpeg" || kind === "gif") tags.push(`q${Math.round(quality)}`);
    if (animated) tags.push(`${duration}s`, `${fps}fps`);
    const base = !compareMaps.isComparing
      ? buildSingleExportBasename()
      : animated
        ? `${buildExportBasename()}_animation`
        : `${buildExportBasename()}_${exportTarget === "before" ? "avant" : exportTarget === "after" ? "apres" : "comparaison"}`;
    return `${base}_${tags.join("_")}.${ext}`;
  }

  // Single-image stage (issue #4) — no mapB/swipe to composite against, and
  // the UI only ever offers "png"/"jpeg" here (GIF/WebM need a second image
  // to animate between), but kind is still checked defensively.
  async function handleSingleExportConfirm(kind: ExportKind, options: ExportConfirmOptions) {
    const mapA = compareMaps.instancesRef.current.mapA;
    if (!mapA || (kind !== "png" && kind !== "jpeg")) return;

    const rotatedOrPitched = mapA.getBearing() !== 0 || mapA.getPitch() !== 0;
    let highRes = Boolean(options.highRes) && !rotatedOrPitched;
    if (options.highRes && rotatedOrPitched) showToast(t("highResRotatedFallback"));

    let scene: SceneAssets | undefined;
    if (highRes) {
      const infoA = compareMaps.renderStateA?.info;
      scene = infoA?.found ? await getSceneAssets(infoA.bestProductId) : undefined;
      if (!scene) {
        highRes = false;
        showToast(t("highResUnresolvedFallback"));
      }
    }

    try {
      if (highRes && scene) {
        setAnimatedBusy(true);
        setProgressText(t("generatingHighRes"));
        setProgressPercent(null);
        await exportHighResSingleImage({
          map: mapA,
          scene,
          mode,
          format: kind,
          filename: options.filename,
          outputWidth: options.maxWidth ?? 3840,
          quality: options.quality,
          labels: buildSingleExportLabels(),
        });
      } else {
        await exportSingleImage({
          map: mapA,
          format: kind,
          filename: options.filename,
          maxWidth: options.maxWidth,
          quality: options.quality,
          labels: buildSingleExportLabels(),
        });
      }
      showToast(t("exportSuccess", { kind: kind.toUpperCase() }));
    } catch (err) {
      console.error(err);
      setStatus(t("exportError", { kind: kind.toUpperCase(), err: err instanceof Error ? err.message : String(err) }), true);
    } finally {
      if (highRes) {
        setAnimatedBusy(false);
        setProgressText("");
        setProgressPercent(null);
      }
    }
  }

  async function handleExportConfirm(kind: ExportKind, options: ExportConfirmOptions) {
    setPendingExportKind(null);
    if (!compareMaps.isComparing) {
      await handleSingleExportConfirm(kind, options);
      return;
    }
    const inst = compareMaps.instancesRef.current;
    if (!inst.mapA || !inst.mapB || !inst.swipe) return;

    if (kind === "png" || kind === "jpeg") {
      // High-res sampling assumes a north-up, unpitched camera (it renders
      // an axis-aligned grid straight from the COGs, unlike the normal path
      // which just reads back whatever the WebGL canvas already shows) —
      // fall back to the ordinary capture instead of producing a mismatched
      // image if the view is rotated or tilted.
      const rotatedOrPitched = inst.mapA.getBearing() !== 0 || inst.mapA.getPitch() !== 0;
      let highRes = Boolean(options.highRes) && !rotatedOrPitched;
      if (options.highRes && rotatedOrPitched) {
        showToast(t("highResRotatedFallback"));
      }

      let sceneA: SceneAssets | undefined;
      let sceneB: SceneAssets | undefined;
      if (highRes) {
        const infoA = compareMaps.renderStateA?.info;
        const infoB = compareMaps.renderStateB?.info;
        const [assetsA, assetsB] = await Promise.all([
          exportTarget !== "after" && infoA?.found ? getSceneAssets(infoA.bestProductId) : Promise.resolve(undefined),
          exportTarget !== "before" && infoB?.found ? getSceneAssets(infoB.bestProductId) : Promise.resolve(undefined),
        ]);
        sceneA = assetsA;
        sceneB = assetsB;
        const missing = (exportTarget !== "after" && !sceneA) || (exportTarget !== "before" && !sceneB);
        if (missing) {
          highRes = false;
          showToast(t("highResUnresolvedFallback"));
        }
      }

      try {
        if (highRes) {
          setAnimatedBusy(true);
          setProgressText(t("generatingHighRes"));
          setProgressPercent(null);
          await exportHighResCompareImage({
            mapA: inst.mapA,
            mapB: inst.mapB,
            sceneA,
            sceneB,
            mode,
            sliderFraction: inst.swipe.getPosition(),
            format: kind,
            target: exportTarget,
            filename: options.filename,
            outputWidth: options.maxWidth ?? 3840,
            quality: options.quality,
            labels: buildExportLabels(exportTarget),
          });
        } else {
          await exportCompareImage({
            mapA: inst.mapA,
            mapB: inst.mapB,
            sliderFraction: inst.swipe.getPosition(),
            format: kind,
            target: exportTarget,
            filename: options.filename,
            maxWidth: options.maxWidth,
            quality: options.quality,
            labels: buildExportLabels(exportTarget),
          });
        }
        showToast(t("exportSuccess", { kind: kind.toUpperCase() }));
      } catch (err) {
        console.error(err);
        setStatus(t("exportError", { kind: kind.toUpperCase(), err: err instanceof Error ? err.message : String(err) }), true);
      } finally {
        if (highRes) {
          setAnimatedBusy(false);
          setProgressText("");
          setProgressPercent(null);
        }
      }
      return;
    }

    setAnimatedBusy(true);
    const label = kind === "gif" ? t("animLabelGif") : t("animLabelWebm");
    setProgressText(t("generating", { label, percent: 0 }));
    setProgressPercent(0);
    try {
      const labels = buildExportLabels("slide");
      const onProgress = (p: number) => {
        const percent = Math.round(p * 100);
        setProgressText(t("generating", { label, percent }));
        setProgressPercent(percent);
      };
      const blob =
        kind === "gif"
          ? await exportCompareGif({ mapA: inst.mapA, mapB: inst.mapB, durationMs: options.durationMs, fps: options.fps, maxWidth: options.maxWidth, quality: options.quality, labels, onProgress })
          : await exportCompareWebm({ mapA: inst.mapA, mapB: inst.mapB, durationMs: options.durationMs, fps: options.fps, maxWidth: options.maxWidth, quality: options.quality, labels, onProgress });
      downloadBlob(blob, options.filename);
      showToast(t("animExportSuccess", { label }));
    } catch (err) {
      console.error(err);
      setStatus(t("animExportError", { label, err: err instanceof Error ? err.message : String(err) }), true);
    } finally {
      setAnimatedBusy(false);
      setProgressPercent(null);
    }
  }

  function requestCloseExportModal() {
    if (pendingExportKind) setShowDiscardConfirm(true);
  }
  function closeExportModalDirect() {
    setPendingExportKind(null);
    setShowDiscardConfirm(false);
  }

  // --- Place search -----------------------------------------------------------

  function handleSelectPlace(result: PlaceResult) {
    const target = getActiveMap();
    if (!target) return;
    // Captured before the move so the *same* stage that was showing re-runs
    // at the new location — re-running the wrong one would silently upgrade
    // a single-image session into a comparison just because the map moved.
    const stageBeforeMove = currentStage();

    function refreshAfterMove() {
      if (stageBeforeMove === "split") void handleCompare();
      else if (stageBeforeMove === "single") void handleDisplay();
    }
    target.once("moveend", refreshAfterMove);

    if (result.boundingBox) {
      const [south, north, west, east] = result.boundingBox;
      target.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding: 20 },
      );
    } else {
      target.flyTo({ center: [result.lon, result.lat], zoom: 11 });
    }
    place.clear();
  }

  // --- Share link ---------------------------------------------------------

  async function handleShare() {
    const activeMap = getActiveMap();
    if (!activeMap) return;
    const params = buildStateParams(activeMap);
    const shareUrl = `${location.origin}${location.pathname}?${params.toString()}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast(t("shareCopied"));
    } catch {
      setStatus(shareUrl);
    }
  }

  // --- Keyboard shortcuts ---------------------------------------------------

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (showDiscardConfirm) {
        if (e.key === "Escape") setShowDiscardConfirm(false);
        return;
      }
      if (pendingExportKind) {
        if (e.key === "Escape") requestCloseExportModal();
        return;
      }
      if (activeModal) {
        if (e.key === "Escape") setActiveModal(null);
        return;
      }
      if (e.key.toLowerCase() === "m" && !isFormField(e.target)) {
        menu.toggleMenu();
        return;
      }
      if (!compareMaps.isOpen) return;
      if (e.key === "Escape") {
        handleClose();
        return;
      }
      if (isFormField(e.target)) return;
      if (!compareMaps.isComparing) return;
      const swipe = compareMaps.instancesRef.current.swipe;
      if (!swipe) return;
      const step = e.shiftKey ? 0.1 : 0.02;
      if (e.key === "ArrowLeft") {
        swipe.setPosition(swipe.getPosition() - step);
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        swipe.setPosition(swipe.getPosition() + step);
        e.preventDefault();
      }
    }
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDiscardConfirm, pendingExportKind, activeModal, compareMaps.isOpen, compareMaps.isComparing, menu]);

  return (
    <>
      <div id="map" ref={baseMap.containerRef} className={compareMaps.isOpen ? "hidden" : ""} />

      <CompareView
        compare={compareMaps}
        mode={mode}
        onManualDateChange={(side, date) => (side === "a" ? setDate1(date) : setDate2(date))}
      />

      <ToastContainer toasts={toasts} />

      <Navbar
        theme={theme.theme}
        onThemeChange={theme.setTheme}
        onOpenInfo={() => setActiveModal("info")}
        onOpenShortcuts={() => setActiveModal("shortcuts")}
      />

      <button
        id="menu-toggle"
        title={t("menuToggleTooltip")}
        aria-expanded={!menu.collapsed}
        aria-controls="panel"
        onClick={menu.toggleMenu}
      >
        ☰
      </button>

      <div id="panel" className={menu.collapsed ? "collapsed" : ""}>
        <AccordionSection
          id="lieu-section"
          title={t("sectionPlace")}
          open={openSection === "lieu"}
          onToggle={(open) => setOpenSection(open ? "lieu" : null)}
        >
          <PlaceSearchSection
            query={place.query}
            onQueryChange={place.setQuery}
            results={place.results}
            onSelect={handleSelectPlace}
            onDismiss={place.clear}
          />
        </AccordionSection>

        <AccordionSection
          id="dates-section"
          title={t("sectionDatesRender")}
          open={openSection === "dates"}
          onToggle={(open) => setOpenSection(open ? "dates" : null)}
        >
          <CompareFormSection
            date1={date1}
            date2={date2}
            onDate1Change={setDate1}
            onDate2Change={setDate2}
            mode={mode}
            onModeChange={handleModeChange}
            priority={priority}
            onPriorityChange={setPriority}
            maxCloud={maxCloud}
            onMaxCloudChange={setMaxCloud}
            windowDays={windowDays}
            onWindowDaysChange={setWindowDays}
            stage={currentStage()}
            busy={compareMaps.isResolving}
            onDisplay={() => void handleDisplay()}
            onCompare={() => void handleCompare()}
            onClose={handleCloseToSingle}
          />
        </AccordionSection>

        {compareMaps.isOpen && (
          <AccordionSection
            id="layers-section"
            title={t("sectionLayers")}
            open={openSection === "layers"}
            onToggle={(open) => setOpenSection(open ? "layers" : null)}
          >
            <LayersSection
              showDepartements={showDepartements}
              onShowDepartementsChange={setShowDepartements}
              departementsOpacity={departementsOpacity}
              onDepartementsOpacityChange={setDepartementsOpacity}
              showVilles={showVilles}
              onShowVillesChange={setShowVilles}
              villesMinPopulation={villesMinPopulation}
              onVillesMinPopulationChange={setVillesMinPopulation}
              villesTextColor={villesTextColor}
              onVillesTextColorChange={setVillesTextColor}
              villesHalo={villesHalo}
              onVillesHaloChange={setVillesHalo}
              villesSizeScale={villesSizeScale}
              onVillesSizeScaleChange={setVillesSizeScale}
            />
          </AccordionSection>
        )}

        {compareMaps.isOpen && (
          <AccordionSection
            id="export-section"
            title={t("sectionExport")}
            open={openSection === "export"}
            onToggle={(open) => setOpenSection(open ? "export" : null)}
          >
            <ExportSection
              single={!compareMaps.isComparing}
              exportTarget={exportTarget}
              onExportTargetChange={setExportTarget}
              onOpenExportModal={setPendingExportKind}
              animatedBusy={animatedBusy}
              progressText={progressText}
              progressPercent={progressPercent}
            />
          </AccordionSection>
        )}

        <AccordionSection
          id="partage-section"
          title={t("sectionShare")}
          open={openSection === "partage"}
          onToggle={(open) => setOpenSection(open ? "partage" : null)}
        >
          <button id="share-btn" onClick={() => void handleShare()}>
            {t("shareBtn")}
          </button>
        </AccordionSection>

        <div
          id="status"
          className={`${status.message ? "status-box " : ""}${status.isError ? "status-warning" : status.message ? "status-info" : ""}`}
        >
          {status.message}
        </div>
      </div>

      <InfoModal open={activeModal === "info"} onClose={() => setActiveModal(null)} />
      <ShortcutsModal open={activeModal === "shortcuts"} onClose={() => setActiveModal(null)} />
      <ExportSettingsModal
        kind={pendingExportKind}
        computeFilename={computeExportFilename}
        onRequestClose={requestCloseExportModal}
        onDirectClose={closeExportModalDirect}
        onConfirm={(kind, options) => void handleExportConfirm(kind, options)}
      />
      <ExportDiscardConfirmModal
        open={showDiscardConfirm}
        onCancel={() => setShowDiscardConfirm(false)}
        onConfirm={() => {
          setShowDiscardConfirm(false);
          setPendingExportKind(null);
        }}
      />
    </>
  );
}
