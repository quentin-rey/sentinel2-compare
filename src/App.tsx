import { useEffect, useMemo, useRef, useState } from "react";
import { useBaseMap } from "./hooks/useBaseMap";
import { useCompareMaps, type CompareOpts, type CompareView as CompareViewParams } from "./hooks/useCompareMaps";
import { useTheme } from "./hooks/useTheme";
import { useMenuCollapsed } from "./hooks/useMenuCollapsed";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import { useToasts } from "./hooks/useToasts";
import { useGeocodeSearch } from "./hooks/useGeocodeSearch";
import { useTranslation } from "./hooks/useLanguage";
import { DEFAULT_MAX_CLOUD, DEFAULT_WINDOW_DAYS, type RenderMode } from "./lib/config";
import type { ScenePriority, Bbox } from "./lib/earthSearch";
import type { PlaceResult } from "./lib/geocode";
import { exportCompareImage, downloadBlob, type ExportLabels } from "./lib/exportImage";
import { exportCompareGif, exportCompareWebm } from "./lib/animatedExport";
import { slug, stripLabelPrefix, dateOnly } from "./utils/format";
import { CompareView } from "./components/CompareView";
import { Navbar } from "./components/Navbar";
import { PlaceSearchSection } from "./components/PlaceSearchSection";
import { CompareFormSection, type CompareStage } from "./components/CompareFormSection";
import { AccordionSection } from "./components/AccordionSection";
import { ExportSection, type ExportTarget } from "./components/ExportSection";
import { ToastContainer } from "./components/ToastContainer";
import { InfoModal } from "./components/modals/InfoModal";
import { ShortcutsModal } from "./components/modals/ShortcutsModal";
import { InstanceIdModal } from "./components/modals/InstanceIdModal";
import { ExportSettingsModal, type ExportKind, type ExportConfirmOptions } from "./components/modals/ExportSettingsModal";
import { ExportDiscardConfirmModal } from "./components/modals/ExportDiscardConfirmModal";
import type { Map as MapLibreMap } from "maplibre-gl";

const RENDER_MODE_LABELS: Record<RenderMode, string> = {
  "true-color": "True Color",
  "false-color": "False Color",
  honc: "Highlight Optimized Natural Color",
  fire: "Wildfire (CDSE)",
};

type ActiveModal = "info" | "shortcuts" | "instance-id" | null;

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
  // Accordion sections: independent, not mutually exclusive — "Dates &
  // rendu" starts open since running a compare is the primary action;
  // "Export" auto-opens once a compare succeeds (see effect below) since
  // there's nothing to export before that.
  const [lieuOpen, setLieuOpen] = useState(false);
  const [datesOpen, setDatesOpen] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [partageOpen, setPartageOpen] = useState(false);
  const [pendingExportKind, setPendingExportKind] = useState<ExportKind | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [animatedBusy, setAnimatedBusy] = useState(false);
  const [progressText, setProgressText] = useState("");

  const theme = useTheme();
  const menu = useMenuCollapsed();
  const { toasts, showToast } = useToasts();
  const place = useGeocodeSearch();
  const { t } = useTranslation();
  // Lets a visitor use their own free CDSE Instance ID instead of the app's
  // shared default one, so their usage draws from their own quota — see the
  // "Identifiant personnel" advanced setting.
  const [customInstanceId, setCustomInstanceId] = useLocalStorageState("s2compare-instance-id", "");

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
  const compareMaps = useCompareMaps({ onMoveEnd: () => syncUrlToCurrentState() });

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
  }, [date1, date2, mode, priority, maxCloud, windowDays, compareMaps.isOpen, compareMaps.isComparing]);

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
        instanceId: customInstanceId.trim() || undefined,
      };
      const result = await compareMaps.runCompare(date1, date2, mode, opts, view);
      // Don't clobber the quota-exceeded status/modal (set by the effect
      // below) with a falsely-clean "no warning" status — the STAC metadata
      // lookup that produces this result succeeds independently of the WMTS
      // imagery quota, so a real quota condition can co-exist with
      // `hasWarning: false` here.
      if (!result.quotaExceeded) {
        setStatus(result.hasWarning ? result.statusMessage : "", result.hasWarning);
      }
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
        instanceId: customInstanceId.trim() || undefined,
      };
      const result = await compareMaps.runSingle(date1, mode, opts, view);
      // Don't clobber the quota-exceeded status/modal (set by the effect
      // below) with a falsely-clean "no warning" status — the STAC metadata
      // lookup that produces this result succeeds independently of the WMTS
      // imagery quota, so a real quota condition can co-exist with
      // `hasWarning: false` here.
      if (!result.quotaExceeded) {
        setStatus(result.hasWarning ? result.statusMessage : "", result.hasWarning);
      }
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

  function handleModeChange(value: RenderMode) {
    setMode(value);
    if (compareMaps.isOpen) compareMaps.changeMode(value);
  }

  // Export has nothing to act on before a comparison succeeds — open it
  // automatically the moment one does, and collapse it again on close so it
  // doesn't linger open and empty for the next session.
  useEffect(() => {
    setExportOpen(compareMaps.isComparing);
  }, [compareMaps.isComparing]);

  // Sentinel Hub returns HTTP 429 once the (shared, by default) quota is
  // exhausted — surface that plainly instead of leaving blank tiles with no
  // explanation.
  useEffect(() => {
    if (compareMaps.quotaExceeded) {
      // Open the dedicated Instance ID modal directly, instead of just
      // pointing at a setting the visitor then has to go hunt for.
      setActiveModal("instance-id");
      setStatus(customInstanceId.trim() ? t("quotaExceededCustom") : t("quotaExceededShared"), true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareMaps.quotaExceeded]);

  // --- Export -----------------------------------------------------------------

  function buildExportBasename(): string {
    const modeSlug = slug(mode);
    const infoA = compareMaps.renderStateA?.info;
    const infoB = compareMaps.renderStateB?.info;
    const d1 = (infoA?.found ? infoA.bestDate : compareMaps.renderStateA?.requestedDate || date1)?.slice(0, 10) || "avant";
    const d2 = (infoB?.found ? infoB.bestDate : compareMaps.renderStateB?.requestedDate || date2)?.slice(0, 10) || "apres";
    return `sentinel2_${modeSlug}_${d1}_vs_${d2}`;
  }

  function buildExportLabels(target: ExportTarget = "slide"): ExportLabels {
    const modeText = RENDER_MODE_LABELS[mode];
    const showHeader = target === "slide";
    return {
      before: { label: showHeader ? t("labelBefore").toUpperCase() : "", value: dateOnly(stripLabelPrefix(compareMaps.labelA.text)) },
      after: { label: showHeader ? t("labelAfter").toUpperCase() : "", value: dateOnly(stripLabelPrefix(compareMaps.labelB.text)) },
      attribution: `Sentinel-2 (Copernicus) · ${modeText}`,
    };
  }

  function computeExportFilename(kind: ExportKind, maxWidth: number, quality: number, duration: number, fps: number): string {
    const ext = kind === "jpeg" ? "jpg" : kind;
    const animated = kind === "gif" || kind === "webm";
    const tags = [maxWidth ? `${maxWidth}px` : "orig"];
    if (kind === "jpeg" || kind === "gif") tags.push(`q${Math.round(quality)}`);
    if (animated) tags.push(`${duration}s`, `${fps}fps`);
    const base = animated
      ? `${buildExportBasename()}_animation`
      : `${buildExportBasename()}_${exportTarget === "before" ? "avant" : exportTarget === "after" ? "apres" : "comparaison"}`;
    return `${base}_${tags.join("_")}.${ext}`;
  }

  async function handleExportConfirm(kind: ExportKind, options: ExportConfirmOptions) {
    setPendingExportKind(null);
    const inst = compareMaps.instancesRef.current;
    if (!inst.mapA || !inst.mapB || !inst.swipe) return;

    if (kind === "png" || kind === "jpeg") {
      try {
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
        showToast(t("exportSuccess", { kind: kind.toUpperCase() }));
      } catch (err) {
        console.error(err);
        setStatus(t("exportError", { kind: kind.toUpperCase(), err: err instanceof Error ? err.message : String(err) }), true);
      }
      return;
    }

    setAnimatedBusy(true);
    const label = kind === "gif" ? t("animLabelGif") : t("animLabelWebm");
    setProgressText(t("generating", { label, percent: 0 }));
    try {
      const labels = buildExportLabels("slide");
      const onProgress = (p: number) => setProgressText(t("generating", { label, percent: Math.round(p * 100) }));
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

      <CompareView compare={compareMaps} mode={mode} />

      <ToastContainer toasts={toasts} />

      <Navbar
        theme={theme.theme}
        onThemeChange={theme.setTheme}
        onOpenInfo={() => setActiveModal("info")}
        onOpenShortcuts={() => setActiveModal("shortcuts")}
        onOpenInstanceId={() => setActiveModal("instance-id")}
        hasCustomInstanceId={customInstanceId.trim().length > 0}
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
        <AccordionSection id="lieu-section" title={t("sectionPlace")} open={lieuOpen} onToggle={setLieuOpen}>
          <PlaceSearchSection
            query={place.query}
            onQueryChange={place.setQuery}
            results={place.results}
            onSelect={handleSelectPlace}
            onDismiss={place.clear}
          />
        </AccordionSection>

        <AccordionSection id="dates-section" title={t("sectionDatesRender")} open={datesOpen} onToggle={setDatesOpen}>
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
            onDisplay={() => void handleDisplay()}
            onCompare={() => void handleCompare()}
            onClose={handleCloseToSingle}
          />
        </AccordionSection>

        {compareMaps.isComparing && (
          <AccordionSection id="export-section" title={t("sectionExport")} open={exportOpen} onToggle={setExportOpen}>
            <ExportSection
              exportTarget={exportTarget}
              onExportTargetChange={setExportTarget}
              onOpenExportModal={setPendingExportKind}
              animatedBusy={animatedBusy}
              progressText={progressText}
            />
          </AccordionSection>
        )}

        <AccordionSection id="partage-section" title={t("sectionShare")} open={partageOpen} onToggle={setPartageOpen}>
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
      <InstanceIdModal
        open={activeModal === "instance-id"}
        value={customInstanceId}
        onChange={setCustomInstanceId}
        onClose={() => setActiveModal(null)}
      />
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
