import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { getSceneAssets, loadSceneData, type Bbox, type SceneDate } from "../lib/earthSearch";
import { registerScene, cogTileUrl, type TileLane } from "../lib/cogProtocol";
import { createSwipe, type SwipeControl } from "../lib/swipe";
import { firstAdminLayerId } from "../lib/adminLayers";
import type { RenderMode } from "../lib/config";
import { formatDate } from "../utils/format";
import { useTranslation, type TFunction } from "./useLanguage";
import type { Lang } from "../i18n/translations";

export interface CompareOpts {
  maxCloud: number;
  windowDays: number;
  priority: "closest" | "leastcloud";
}

// Either a resolved lookup result, or the "metadata unavailable" fallback
// (STAC request itself failed — nothing renders for that side either way,
// same as "not found", just for a different reason).
type SceneInfoLike =
  | { found: true; unknown?: false; bestDate: string; bestCloudCover: number; tileCount: number; count?: number; bestProductId: string }
  | { found: false; unknown?: false; count?: number; tileCount?: number }
  | { found: false; unknown: true };

interface LabelState {
  text: string;
  title: string;
  loading: boolean;
}

interface SideRenderState {
  requestedDate: string;
  info: SceneInfoLike;
}

export interface CompareView {
  center: [number, number] | { lng: number; lat: number };
  zoom: number;
  bearing: number;
  pitch: number;
  bbox: Bbox;
}

const DEFAULT_LABEL: LabelState = { text: "", title: "", loading: false };

// Needed for the "départements"/"villes" overlay labels (lib/adminLayers.ts)
// — MapLibre refuses any symbol layer's text-field without a glyphs URL,
// even on a style that otherwise has no sources/layers of its own yet.
// A *fresh object every call*, not a shared constant: MapLibre's Style
// mutates the config object it's given in place (map.addSource/addLayer
// push straight into style.sources/style.layers), so a single shared object
// reused across mapA/mapB/multiple runCompare calls would accumulate every
// previous session's sources and layers — and a later map reusing the same
// layer id (e.g. "layer-a") would then fail to add it, since the "empty"
// style handed to its constructor secretly already declared one.
function emptyStyle() {
  return { version: 8 as const, glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf", sources: {}, layers: [] };
}

function describeScene(label: string, requestedDate: string, info: SceneInfoLike, t: TFunction, lang: Lang): string {
  const date = formatDate(requestedDate, lang);
  if (info.unknown) return t("sceneApprox", { label, date });
  if (!info.found) return t("sceneNotFound", { label, date });
  return t("sceneFound", { label, date: formatDate(info.bestDate, lang), cloud: info.bestCloudCover.toFixed(0), tiles: info.tileCount });
}

function labelFor(prefix: string, requestedDate: string, info: SceneInfoLike, opts: CompareOpts, t: TFunction, lang: Lang): string {
  if (info.unknown) return t("labelApprox", { prefix, date: formatDate(requestedDate, lang) });
  if (!info.found) return t("labelNoImage", { prefix });
  const approx = opts.priority === "leastcloud" ? " ≈" : "";
  return t("labelFound", { prefix, approx, date: formatDate(info.bestDate, lang), cloud: info.bestCloudCover.toFixed(0) });
}

function sceneTooltip(requestedDate: string, info: SceneInfoLike, opts: CompareOpts, t: TFunction, lang: Lang): string {
  const date = formatDate(requestedDate, lang);
  if (info.unknown) return t("tooltipUnavailable", { date, windowDays: opts.windowDays });
  if (!info.found) return t("tooltipNotFound", { windowDays: opts.windowDays, date });
  const priorityLabel = opts.priority === "leastcloud" ? t("priorityLabelLeastCloud") : t("priorityLabelClosest");
  return t("tooltipFound", { date, priorityLabel, windowDays: opts.windowDays });
}

async function safeSceneData(bbox: Bbox, date: string, opts: CompareOpts) {
  try {
    return await loadSceneData(bbox, date, opts);
  } catch (err) {
    console.warn("Métadonnées STAC indisponibles:", err);
    return { info: { found: false, unknown: true } as SceneInfoLike, dates: [] as SceneDate[] };
  }
}

/**
 * Owns the two compare-mode MapLibre instances (mapA/mapB) and the swipe
 * divider between them. `mapA`/`mapB`/the swipe control live in a ref (not
 * state) — camera `move` events fire continuously while panning, and
 * routing that through setState would cause needless re-renders of a tree
 * that has nothing to do with the map's own WebGL rendering. Only the
 * pieces that actually drive JSX (open/resolving status, label text/
 * spinner, date-picker options) are real state.
 */
interface UseCompareMapsOptions {
  onMoveEnd?: (map: MapLibreMap) => void;
}

export function useCompareMaps(options?: UseCompareMapsOptions) {
  const { t, lang } = useTranslation();
  // Read via a ref (not directly) inside runCompare's "moveend" handlers —
  // `options` closes over live App state (current dates/mode) and would
  // otherwise be frozen to whatever it was the one time runCompare's
  // useCallback identity was last rebuilt.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const mapAContainerRef = useRef<HTMLDivElement | null>(null);
  const mapBContainerRef = useRef<HTMLDivElement | null>(null);
  const mapBWrapRef = useRef<HTMLDivElement | null>(null);
  const swiperRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const instancesRef = useRef<{ mapA: MapLibreMap | null; mapB: MapLibreMap | null; swipe: SwipeControl | null }>({
    mapA: null,
    mapB: null,
    swipe: null,
  });

  const [isOpen, setIsOpen] = useState(false);
  // isOpen: some image is showing (single OR split). isComparing: split view
  // with both sides — governs whether the slider/mapB/Export exist.
  const [isComparing, setIsComparing] = useState(false);
  // Bumped every time runCompare/runSingle builds a *fresh* mapA/mapB pair
  // (e.g. re-running "Comparer" with new dates while already comparing,
  // where isOpen/isComparing don't themselves change). instancesRef is a
  // plain ref, so callers that need to re-apply something to "whichever
  // map instances currently exist" (App.tsx's admin-layers effect) can't
  // just depend on isOpen/isComparing — they need this to fire too.
  const [mapGeneration, setMapGeneration] = useState(0);
  const [isResolving, setIsResolving] = useState(false);
  const [labelA, setLabelA] = useState<LabelState>(DEFAULT_LABEL);
  const [labelB, setLabelB] = useState<LabelState>(DEFAULT_LABEL);
  const [datesA, setDatesA] = useState<SceneDate[]>([]);
  const [datesB, setDatesB] = useState<SceneDate[]>([]);
  const [renderStateA, setRenderStateA] = useState<SideRenderState | null>(null);
  const [renderStateB, setRenderStateB] = useState<SideRenderState | null>(null);
  const [lastOpts, setLastOpts] = useState<CompareOpts | null>(null);

  // mapA/mapB are constructed synchronously inside runCompare()/runSingle(),
  // in the same tick as the setIsOpen(true)/setIsComparing(true) call that
  // removes the "hidden" class from #compare/#map-b-wrap — but React
  // doesn't commit that DOM change until *after* this synchronous code
  // finishes (there's no `await` before the map constructors run). So at
  // construction time the container is still display:none (zero size), and
  // MapLibre's `trackResize` only listens for actual window resize events —
  // it has no way to notice its container silently became visible. Once
  // this effect runs (after the "hidden" class removal has actually been
  // committed and painted), the container has its real size, and an
  // explicit resize() re-measures it correctly. Depends on `isComparing`
  // too, not just `isOpen` — upgrading from single to split flips
  // #map-b-wrap's own hidden class on a *separate* transition from the one
  // that first opened #compare, and mapB needs its own resize() at that
  // later point (mapA was already visible/sized correctly by then).
  useEffect(() => {
    if (!isOpen) return;
    const inst = instancesRef.current;
    inst.mapA?.resize();
    inst.mapB?.resize();
  }, [isOpen, isComparing]);

  // labelA/labelB are plain strings, generated once per compare/date-pick —
  // switching language mid-session wouldn't otherwise update the on-map
  // labels until the next compare. Regenerate them from the stored render
  // state (no network refetch needed) whenever the language changes.
  useEffect(() => {
    if (!renderStateA || !lastOpts) return;
    const prefixA = isComparing ? t("labelBefore") : t("labelSingle");
    setLabelA((s) => ({ ...s, text: labelFor(prefixA, renderStateA.requestedDate, renderStateA.info, lastOpts, t, lang), title: sceneTooltip(renderStateA.requestedDate, renderStateA.info, lastOpts, t, lang) }));
    if (isComparing && renderStateB) {
      const prefixAfter = t("labelAfter");
      setLabelB((s) => ({ ...s, text: labelFor(prefixAfter, renderStateB.requestedDate, renderStateB.info, lastOpts, t, lang), title: sceneTooltip(renderStateB.requestedDate, renderStateB.info, lastOpts, t, lang) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // Points a side's raster source at a resolved scene's tiles — creates the
  // source/layer the first time a side gets an image, or tears down and
  // re-adds it on every later mode change/manual date pick.
  // registerScene() makes the scene's COG assets available to the s2cog://
  // protocol handler (lib/cogProtocol.ts), which does the actual per-tile
  // decode/reprojection/render in a Worker pool.
  //
  // Deliberately NOT using the source's own setTiles() to swap the URL in
  // place: MapLibre's RasterTileSource.load() (unlike VectorTileSource's)
  // never calls the SourceCache's clearTiles() — it assumes tile content at
  // a given z/x/y from a given source is immutable forever, so already-
  // rendered tiles keep showing their *old* pixels after setTiles() even
  // though the URL template (and therefore the actual image) changed.
  // Removing and re-adding the source sidesteps that stale-cache behavior.
  // Returns a promise resolving once the map is actually done rendering
  // this layer's tiles (MapLibre's "idle" event) — callers that only care
  // about the per-side spinner can fire-and-forget it, but runCompare/
  // runSingle await it so the big loading banner stays up for the whole
  // render, not just until the source is added.
  const setSceneLayer = useCallback(
    async (mapInstance: MapLibreMap, layerId: string, key: string, mode: RenderMode, productId: string, lane: TileLane, setLoading: (loading: boolean) => void): Promise<void> => {
      const assets = await getSceneAssets(productId);
      if (!assets) return;
      registerScene(productId, assets);
      const url = cogTileUrl(productId, mode, lane);
      if (mapInstance.getSource(key)) {
        mapInstance.removeLayer(layerId);
        mapInstance.removeSource(key);
      }
      setLoading(true);
      const idle = new Promise<void>((resolve) => {
        mapInstance.once("idle", () => {
          setLoading(false);
          resolve();
        });
      });
      mapInstance.addSource(key, { type: "raster", tiles: [url], tileSize: 256 });
      // Every reload (initial display, render-mode change, manual date pick)
      // re-adds this layer from scratch — addLayer() with no beforeId always
      // appends at the very top, which would bury an already-present
      // départements/villes overlay (lib/adminLayers.ts) under the new
      // imagery. Inserting just below the lowest overlay layer (if any)
      // keeps those overlays on top regardless of load order.
      mapInstance.addLayer({ id: layerId, type: "raster", source: key }, firstAdminLayerId(mapInstance));
      return idle;
    },
    [],
  );

  const runCompare = useCallback(
    async (date1: string, date2: string, mode: RenderMode, opts: CompareOpts, view: CompareView) => {
      const { center, zoom, bearing, pitch, bbox } = view;

      setIsOpen(true);
      setIsComparing(true);
      setLabelA({ text: t("loadingBefore"), title: "", loading: true });
      setLabelB({ text: t("loadingAfter"), title: "", loading: true });
      setDatesA([]);
      setDatesB([]);

      const inst = instancesRef.current;
      inst.swipe?.destroy();
      inst.mapA?.remove();
      inst.mapB?.remove();
      inst.swipe = null;

      if (!mapAContainerRef.current || !mapBContainerRef.current) {
        // Should be unreachable — the containers are always mounted (see
        // module doc comment) — but keeps the return type total.
        setIsOpen(false);
        return { statusMessage: t("internalError"), hasWarning: true };
      }
      const mapA = new maplibregl.Map({
        container: mapAContainerRef.current,
        style: emptyStyle(),
        center,
        zoom,
        bearing,
        pitch,
        interactive: true,
        preserveDrawingBuffer: true,
      });
      const mapB = new maplibregl.Map({
        container: mapBContainerRef.current,
        style: emptyStyle(),
        center,
        zoom,
        bearing,
        pitch,
        interactive: true,
        preserveDrawingBuffer: true,
      });
      inst.mapA = mapA;
      inst.mapB = mapB;
      setMapGeneration((g) => g + 1);

      mapA.on("moveend", () => optionsRef.current?.onMoveEnd?.(mapA));
      mapB.on("moveend", () => optionsRef.current?.onMoveEnd?.(mapB));

      await Promise.all([new Promise<void>((r) => mapA.on("load", () => r())), new Promise<void>((r) => mapB.on("load", () => r()))]);

      if (mapBWrapRef.current && swiperRef.current && containerRef.current) {
        inst.swipe = createSwipe({
          mapA,
          mapB,
          wrapEl: mapBWrapRef.current,
          sliderEl: swiperRef.current,
          containerEl: containerRef.current,
        });
      }

      // Unlike the old WMTS renderer, there's no wide-window "instant
      // preview" possible here — client-side rendering needs a specific
      // resolved scene's COGs before anything can be drawn at all. The
      // banner (isResolving) now stays up through STAC lookup *and* actual
      // tile rendering (awaits setSceneLayer's returned promise below),
      // instead of dropping the instant the source is added — otherwise it
      // disappeared right as the slow part (COG decode/reprojection) began,
      // leaving the map looking stalled with no visible feedback.
      setIsResolving(true);
      const [sceneA, sceneB] = await Promise.all([safeSceneData(bbox, date1, opts), safeSceneData(bbox, date2, opts)]);
      const infoA = sceneA.info as SceneInfoLike;
      const infoB = sceneB.info as SceneInfoLike;

      const prefixBefore = t("labelBefore");
      const prefixAfter = t("labelAfter");
      setLabelA((s) => ({ ...s, text: labelFor(prefixBefore, date1, infoA, opts, t, lang), title: sceneTooltip(date1, infoA, opts, t, lang) }));
      setLabelB((s) => ({ ...s, text: labelFor(prefixAfter, date2, infoB, opts, t, lang), title: sceneTooltip(date2, infoB, opts, t, lang) }));
      setDatesA(sceneA.dates);
      setDatesB(sceneB.dates);
      setRenderStateA({ requestedDate: date1, info: infoA });
      setRenderStateB({ requestedDate: date2, info: infoB });
      setLastOpts(opts);

      const renderPromises: Promise<void>[] = [];
      if (infoA.found) renderPromises.push(setSceneLayer(mapA, "layer-a", "src-a", mode, infoA.bestProductId, "a", (loading) => setLabelA((s) => ({ ...s, loading }))));
      else setLabelA((s) => ({ ...s, loading: false }));
      if (infoB.found) renderPromises.push(setSceneLayer(mapB, "layer-b", "src-b", mode, infoB.bestProductId, "b", (loading) => setLabelB((s) => ({ ...s, loading }))));
      else setLabelB((s) => ({ ...s, loading: false }));
      await Promise.all(renderPromises);
      setIsResolving(false);

      const hasWarning = !infoA.found || !infoB.found;
      return {
        statusMessage: `${describeScene(prefixBefore, date1, infoA, t, lang)} ${describeScene(prefixAfter, date2, infoB, t, lang)}`,
        hasWarning,
      };
    },
    [setSceneLayer, t, lang],
  );

  // Single-image display — the wizard's first step. Builds only mapA (no
  // mapB, no swipe control): a real single-image mode, not a disguised
  // compare with a hidden second side. Upgrading to a full comparison later
  // just calls runCompare() again (see the module doc comment on App.tsx's
  // side of this) rather than trying to carry this map instance over.
  const runSingle = useCallback(
    async (date: string, mode: RenderMode, opts: CompareOpts, view: CompareView) => {
      const { center, zoom, bearing, pitch, bbox } = view;

      setIsOpen(true);
      setIsComparing(false);
      setLabelA({ text: t("loadingSingle"), title: "", loading: true });
      setLabelB(DEFAULT_LABEL);
      setDatesA([]);
      setDatesB([]);

      const inst = instancesRef.current;
      // Defensive, mirroring runCompare — tears down any prior session
      // (single or split) so this always starts from a clean slate.
      inst.swipe?.destroy();
      inst.mapA?.remove();
      inst.mapB?.remove();
      inst.mapB = null;
      inst.swipe = null;

      if (!mapAContainerRef.current) {
        // Should be unreachable — the container is always mounted.
        setIsOpen(false);
        return { statusMessage: t("internalError"), hasWarning: true };
      }
      const mapA = new maplibregl.Map({
        container: mapAContainerRef.current,
        style: emptyStyle(),
        center,
        zoom,
        bearing,
        pitch,
        interactive: true,
        preserveDrawingBuffer: true,
      });
      inst.mapA = mapA;
      setMapGeneration((g) => g + 1);

      mapA.on("moveend", () => optionsRef.current?.onMoveEnd?.(mapA));

      await new Promise<void>((r) => mapA.on("load", () => r()));

      setIsResolving(true);
      const sceneA = await safeSceneData(bbox, date, opts);
      const infoA = sceneA.info as SceneInfoLike;

      const prefixSingle = t("labelSingle");
      setLabelA((s) => ({ ...s, text: labelFor(prefixSingle, date, infoA, opts, t, lang), title: sceneTooltip(date, infoA, opts, t, lang) }));
      setDatesA(sceneA.dates);
      setRenderStateA({ requestedDate: date, info: infoA });
      setLastOpts(opts);

      if (infoA.found) await setSceneLayer(mapA, "layer-a", "src-a", mode, infoA.bestProductId, "a", (loading) => setLabelA((s) => ({ ...s, loading })));
      else setLabelA((s) => ({ ...s, loading: false }));
      setIsResolving(false);

      const hasWarning = !infoA.found;
      return { statusMessage: describeScene(prefixSingle, date, infoA, t, lang), hasWarning };
    },
    [setSceneLayer, t, lang],
  );

  const closeCompare = useCallback(() => {
    setIsOpen(false);
    setIsComparing(false);
    setIsResolving(false);
    const inst = instancesRef.current;
    inst.swipe?.destroy();
    inst.mapA?.remove();
    inst.mapB?.remove();
    inst.mapA = null;
    inst.mapB = null;
    inst.swipe = null;
    setRenderStateA(null);
    setRenderStateB(null);
    setLastOpts(null);
    setDatesA([]);
    setDatesB([]);
  }, []);

  // Called when the render mode select changes while an image is showing —
  // swaps mapA alone in single mode, both sides once actually comparing.
  const changeMode = useCallback(
    (mode: RenderMode) => {
      const inst = instancesRef.current;
      if (!inst.mapA || !renderStateA?.info.found) return;
      setSceneLayer(inst.mapA, "layer-a", "src-a", mode, renderStateA.info.bestProductId, "a", (loading) => setLabelA((s) => ({ ...s, loading })));
      if (inst.mapB && renderStateB?.info.found) {
        setSceneLayer(inst.mapB, "layer-b", "src-b", mode, renderStateB.info.bestProductId, "b", (loading) => setLabelB((s) => ({ ...s, loading })));
      }
    },
    [renderStateA, renderStateB, setSceneLayer],
  );

  // Manually picking a date from a side's picker dropdown — pins that exact
  // day directly (bypassing the STAC "best match" resolution) and updates
  // that side's label/render-state to match.
  const pickManualDate = useCallback(
    (side: "a" | "b", dateStr: string, mode: RenderMode, dates: SceneDate[]) => {
      const inst = instancesRef.current;
      const mapInstance = side === "a" ? inst.mapA : inst.mapB;
      const layerId = side === "a" ? "layer-a" : "layer-b";
      const key = side === "a" ? "src-a" : "src-b";
      const setLabel = side === "a" ? setLabelA : setLabelB;
      const prefix = side === "a" ? (isComparing ? t("labelBefore") : t("labelSingle")) : t("labelAfter");
      const chosen = dates.find((d) => d.date === dateStr);
      if (!mapInstance || !dateStr || !chosen) return;

      setSceneLayer(mapInstance, layerId, key, mode, chosen.productId, side, (loading) => setLabel((s) => ({ ...s, loading })));

      const cloudCover = chosen.cloudCover ?? 0;
      const updatedInfo: SceneInfoLike = {
        found: true,
        bestDate: dateStr,
        bestCloudCover: cloudCover,
        tileCount: chosen.tileCount,
        bestProductId: chosen.productId,
      };
      if (side === "a") setRenderStateA({ requestedDate: dateStr, info: updatedInfo });
      else setRenderStateB({ requestedDate: dateStr, info: updatedInfo });
      setLabel({
        text: `${prefix} — ${formatDate(dateStr, lang)} · ${cloudCover.toFixed(0)}% ☁`,
        title: t("manualPickTooltip"),
        loading: false,
      });
    },
    [isComparing, setSceneLayer, t, lang],
  );

  const resetSlider = useCallback(() => {
    instancesRef.current.swipe?.setPosition(0.5);
  }, []);

  return {
    mapAContainerRef,
    mapBContainerRef,
    mapBWrapRef,
    swiperRef,
    containerRef,
    instancesRef,
    isOpen,
    isComparing,
    mapGeneration,
    isResolving,
    labelA,
    labelB,
    datesA,
    datesB,
    renderStateA,
    renderStateB,
    runSingle,
    runCompare,
    closeCompare,
    changeMode,
    pickManualDate,
    resetSlider,
  };
}

export type UseCompareMapsResult = ReturnType<typeof useCompareMaps>;
