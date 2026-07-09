import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { wmtsTileUrl, dayRange, SH_WMTS_HOST } from "../lib/wmts";
import { loadSceneData, fetchDayCloudCover, type Bbox, type SceneDate } from "../lib/stacInfo";
import { createSwipe, type SwipeControl } from "../lib/swipe";
import type { RenderMode } from "../lib/config";
import { formatDate } from "../utils/format";
import { useTranslation, type TFunction } from "./useLanguage";
import type { Lang } from "../i18n/translations";

export interface CompareOpts {
  maxCloud: number;
  windowDays: number;
  priority: "closest" | "leastcloud";
  // Overrides the app's shared Sentinel Hub Instance ID with the visitor's
  // own — see useInstanceId / the "Identifiant personnel" advanced setting.
  instanceId?: string;
}

// Either a resolved lookup result, or the "metadata unavailable" fallback
// (STAC request itself failed — still renders a wide-window fallback).
export type SceneInfoLike =
  | { found: true; unknown?: false; bestDate: string; bestCloudCover: number; tileCount: number; count?: number }
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

function resolveTimeParams(requestedDate: string, info: SceneInfoLike, opts: CompareOpts) {
  if (info.found) {
    return { timeRange: dayRange(info.bestDate), maxCloud: 100, priority: "mostRecent" as const, instanceId: opts.instanceId };
  }
  if (info.unknown) {
    const target = new Date(requestedDate + "T00:00:00Z");
    const start = new Date(target.getTime() - opts.windowDays * 86400000).toISOString().slice(0, 10);
    const end = new Date(target.getTime() + opts.windowDays * 86400000).toISOString().slice(0, 10);
    return {
      timeRange: `${start}/${end}`,
      maxCloud: opts.priority === "leastcloud" ? opts.maxCloud : 100,
      priority: (opts.priority === "leastcloud" ? "leastCC" : "mostRecent") as "leastCC" | "mostRecent",
      instanceId: opts.instanceId,
    };
  }
  return null;
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

// Sentinel Hub returns HTTP 429 once the configuration's processing-unit
// quota is exhausted for the period — MapLibre surfaces that as a plain
// failed-tile "error" event with no special handling of its own, so a tile
// just silently stays blank. Detecting it here lets the UI show something
// actionable instead.
function isQuotaErrorEvent(e: { error?: unknown }): boolean {
  const err = e.error as { status?: number; url?: string } | undefined;
  return err?.status === 429 && typeof err.url === "string" && err.url.startsWith(SH_WMTS_HOST);
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
export function useCompareMaps() {
  const { t, lang } = useTranslation();
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
  // Guards against re-fetching cloud cover every time a picker is re-opened
  // (mousedown + focus both fire onOpenPicker) — reset whenever a fresh
  // compare starts.
  const cloudLoadStartedRef = useRef<{ a: boolean; b: boolean }>({ a: false, b: false });
  // Only surface one quota warning per compare session — every failed tile
  // in the viewport would otherwise fire its own "error" event.
  const quotaWarnedRef = useRef(false);
  // Sentinel Hub returns the same HTTP 429 both for real quota exhaustion
  // *and* for transient per-second rate-limiting — panning/zooming fires many
  // tile requests at once and can trip the latter briefly even when the
  // account is nowhere near its real quota. Requiring several 429s with no
  // successful tile load in between (reset on any successful tile, see
  // handleTileSuccess below) tells the two apart: a real quota exhaustion
  // fails *every* subsequent tile, while a rate-limit blip is followed by
  // normal successful loads once the burst settles.
  const quotaErrorCountRef = useRef(0);
  const QUOTA_ERROR_THRESHOLD = 5;

  const [isOpen, setIsOpen] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [labelA, setLabelA] = useState<LabelState>(DEFAULT_LABEL);
  const [labelB, setLabelB] = useState<LabelState>(DEFAULT_LABEL);
  const [datesA, setDatesA] = useState<SceneDate[]>([]);
  const [datesB, setDatesB] = useState<SceneDate[]>([]);
  const [renderStateA, setRenderStateA] = useState<SideRenderState | null>(null);
  const [renderStateB, setRenderStateB] = useState<SideRenderState | null>(null);
  const [lastOpts, setLastOpts] = useState<CompareOpts | null>(null);

  // mapA/mapB are constructed synchronously inside runCompare(), in the same
  // tick as the setIsOpen(true) call that removes the "hidden" class from
  // #compare — but React doesn't commit that DOM change until *after* this
  // synchronous code finishes (there's no `await` before the map
  // constructors run). So at construction time the container is still
  // display:none (zero size), and MapLibre's `trackResize` only listens for
  // actual window resize events — it has no way to notice its container
  // silently became visible. Once this effect runs (after the "hidden"
  // class removal has actually been committed and painted), the container
  // has its real size, and an explicit resize() re-measures it correctly.
  useEffect(() => {
    if (!isOpen) return;
    const inst = instancesRef.current;
    inst.mapA?.resize();
    inst.mapB?.resize();
  }, [isOpen]);

  // labelA/labelB are plain strings, generated once per compare/date-pick —
  // switching language mid-session wouldn't otherwise update the on-map
  // labels until the next compare. Regenerate them from the stored render
  // state (no network refetch needed) whenever the language changes.
  useEffect(() => {
    if (!renderStateA || !renderStateB || !lastOpts) return;
    const prefixBefore = t("labelBefore");
    const prefixAfter = t("labelAfter");
    setLabelA((s) => ({ ...s, text: labelFor(prefixBefore, renderStateA.requestedDate, renderStateA.info, lastOpts, t, lang), title: sceneTooltip(renderStateA.requestedDate, renderStateA.info, lastOpts, t, lang) }));
    setLabelB((s) => ({ ...s, text: labelFor(prefixAfter, renderStateB.requestedDate, renderStateB.info, lastOpts, t, lang), title: sceneTooltip(renderStateB.requestedDate, renderStateB.info, lastOpts, t, lang) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const addCompareLayer = useCallback(
    (mapInstance: MapLibreMap, layerId: string, key: string, mode: RenderMode, requestedDate: string, info: SceneInfoLike, opts: CompareOpts) => {
      const params = resolveTimeParams(requestedDate, info, opts);
      if (!params) return;
      mapInstance.addSource(key, {
        type: "raster",
        tiles: [wmtsTileUrl(mode, params.timeRange, params)],
        tileSize: 256,
      });
      mapInstance.addLayer({ id: layerId, type: "raster", source: key });
    },
    [],
  );

  // Swaps the render mode/date of an already-loaded side in place (no
  // re-fetch of STAC metadata, no map recreation) using MapLibre's
  // setTiles().
  const swapLayerMode = useCallback(
    (
      mapInstance: MapLibreMap,
      key: string,
      mode: RenderMode,
      requestedDate: string,
      info: SceneInfoLike,
      opts: CompareOpts,
      setLoading: (loading: boolean) => void,
    ) => {
      const params = resolveTimeParams(requestedDate, info, opts);
      const source = mapInstance.getSource(key) as maplibregl.RasterTileSource | undefined;
      if (!params || !source) return;
      setLoading(true);
      mapInstance.once("idle", () => setLoading(false));
      source.setTiles([wmtsTileUrl(mode, params.timeRange, params)]);
    },
    [],
  );

  const runCompare = useCallback(
    async (date1: string, date2: string, mode: RenderMode, opts: CompareOpts, view: CompareView) => {
      const { center, zoom, bearing, pitch, bbox } = view;

      setIsOpen(true);
      setLabelA({ text: t("loadingBefore"), title: "", loading: true });
      setLabelB({ text: t("loadingAfter"), title: "", loading: true });
      setDatesA([]);
      setDatesB([]);
      cloudLoadStartedRef.current = { a: false, b: false };
      quotaWarnedRef.current = false;
      quotaErrorCountRef.current = 0;
      setQuotaExceeded(false);

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
      const emptyStyle = { version: 8 as const, sources: {}, layers: [] };
      const mapA = new maplibregl.Map({
        container: mapAContainerRef.current,
        style: emptyStyle,
        center,
        zoom,
        bearing,
        pitch,
        interactive: true,
        preserveDrawingBuffer: true,
      });
      const mapB = new maplibregl.Map({
        container: mapBContainerRef.current,
        style: emptyStyle,
        center,
        zoom,
        bearing,
        pitch,
        interactive: true,
        preserveDrawingBuffer: true,
      });
      inst.mapA = mapA;
      inst.mapB = mapB;

      const handleTileError = (e: { error?: unknown }) => {
        if (quotaWarnedRef.current || !isQuotaErrorEvent(e)) return;
        quotaErrorCountRef.current += 1;
        if (quotaErrorCountRef.current < QUOTA_ERROR_THRESHOLD) return;
        quotaWarnedRef.current = true;
        setQuotaExceeded(true);
      };
      // Any tile that *does* load successfully means we're not actually
      // locked out — clears the counter so a brief rate-limit burst doesn't
      // accumulate toward the threshold across an otherwise-healthy session.
      const handleTileSuccess = (e: { dataType?: string; tile?: unknown }) => {
        if (e.dataType === "source" && e.tile) quotaErrorCountRef.current = 0;
      };
      mapA.on("error", handleTileError);
      mapB.on("error", handleTileError);
      mapA.on("data", handleTileSuccess);
      mapB.on("data", handleTileSuccess);

      await Promise.all([new Promise<void>((r) => mapA.on("load", () => r())), new Promise<void>((r) => mapB.on("load", () => r()))]);

      // Instant preview: render *something* right away using a wide,
      // unpinned date window instead of waiting several seconds on the
      // metadata lookup before any pixel appears. The exact pinned day
      // swaps in silently once the real lookup resolves.
      addCompareLayer(mapA, "layer-a", "src-a", mode, date1, { found: false, unknown: true }, opts);
      addCompareLayer(mapB, "layer-b", "src-b", mode, date2, { found: false, unknown: true }, opts);
      setIsResolving(true);

      if (mapBWrapRef.current && swiperRef.current && containerRef.current) {
        inst.swipe = createSwipe({
          mapA,
          mapB,
          wrapEl: mapBWrapRef.current,
          sliderEl: swiperRef.current,
          containerEl: containerRef.current,
        });
      }

      const [sceneA, sceneB] = await Promise.all([safeSceneData(bbox, date1, opts), safeSceneData(bbox, date2, opts)]);
      const infoA = sceneA.info as SceneInfoLike;
      const infoB = sceneB.info as SceneInfoLike;

      // Swap the preview tiles for the exact resolved day/scene.
      swapLayerMode(mapA, "src-a", mode, date1, infoA, opts, (loading) => setLabelA((s) => ({ ...s, loading })));
      swapLayerMode(mapB, "src-b", mode, date2, infoB, opts, (loading) => setLabelB((s) => ({ ...s, loading })));
      setIsResolving(false);

      const prefixBefore = t("labelBefore");
      const prefixAfter = t("labelAfter");
      setLabelA({ text: labelFor(prefixBefore, date1, infoA, opts, t, lang), title: sceneTooltip(date1, infoA, opts, t, lang), loading: false });
      setLabelB({ text: labelFor(prefixAfter, date2, infoB, opts, t, lang), title: sceneTooltip(date2, infoB, opts, t, lang), loading: false });
      setDatesA(sceneA.dates);
      setDatesB(sceneB.dates);
      setRenderStateA({ requestedDate: date1, info: infoA });
      setRenderStateB({ requestedDate: date2, info: infoB });
      setLastOpts(opts);

      const hasWarning = !infoA.found || !infoB.found;
      return {
        statusMessage: `${describeScene(prefixBefore, date1, infoA, t, lang)} ${describeScene(prefixAfter, date2, infoB, t, lang)}`,
        hasWarning,
      };
    },
    [addCompareLayer, swapLayerMode, t, lang],
  );

  const closeCompare = useCallback(() => {
    setIsOpen(false);
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
    cloudLoadStartedRef.current = { a: false, b: false };
    quotaWarnedRef.current = false;
    quotaErrorCountRef.current = 0;
    setQuotaExceeded(false);
  }, []);

  // Cloud cover isn't fetched upfront for every candidate day (see
  // lib/stacInfo.ts — each lookup is its own network round-trip, and most
  // days in the picker will never be looked at). Instead it's fetched
  // lazily, only once the user actually opens this side's dropdown, in
  // parallel for every day still missing it.
  const requestCloudCoverForSide = useCallback((side: "a" | "b") => {
    if (cloudLoadStartedRef.current[side]) return;
    cloudLoadStartedRef.current[side] = true;
    const setDates = side === "a" ? setDatesA : setDatesB;
    setDates((current) => {
      for (const d of current) {
        if (d.cloudCover != null) continue;
        fetchDayCloudCover(d.productId).then((cloud) => {
          setDates((prev) => prev.map((entry) => (entry.date === d.date ? { ...entry, cloudCover: cloud } : entry)));
        });
      }
      return current;
    });
  }, []);

  // Called when the render mode select changes while a comparison is open.
  const changeMode = useCallback(
    (mode: RenderMode) => {
      const inst = instancesRef.current;
      if (!inst.mapA || !inst.mapB || !renderStateA || !renderStateB || !lastOpts) return;
      swapLayerMode(inst.mapA, "src-a", mode, renderStateA.requestedDate, renderStateA.info, lastOpts, (loading) => setLabelA((s) => ({ ...s, loading })));
      swapLayerMode(inst.mapB, "src-b", mode, renderStateB.requestedDate, renderStateB.info, lastOpts, (loading) => setLabelB((s) => ({ ...s, loading })));
    },
    [renderStateA, renderStateB, lastOpts, swapLayerMode],
  );

  // Manually picking a date from a side's picker dropdown — pins that exact
  // day directly (bypassing the STAC "best match" resolution) and updates
  // that side's label/render-state to match.
  const pickManualDate = useCallback(
    async (side: "a" | "b", dateStr: string, mode: RenderMode, dates: SceneDate[]) => {
      const inst = instancesRef.current;
      const mapInstance = side === "a" ? inst.mapA : inst.mapB;
      const key = side === "a" ? "src-a" : "src-b";
      const setLabel = side === "a" ? setLabelA : setLabelB;
      const prefix = side === "a" ? t("labelBefore") : t("labelAfter");
      const source = mapInstance?.getSource(key) as maplibregl.RasterTileSource | undefined;
      if (!mapInstance || !dateStr || !source) return;

      const params = { timeRange: dayRange(dateStr), maxCloud: 100, priority: "mostRecent" as const, instanceId: lastOpts?.instanceId };
      setLabel((s) => ({ ...s, loading: true }));
      mapInstance.once("idle", () => setLabel((s) => ({ ...s, loading: false })));
      source.setTiles([wmtsTileUrl(mode, params.timeRange, params)]);

      const chosen = dates.find((d) => d.date === dateStr);
      let cloudCover = chosen?.cloudCover ?? null;
      if (chosen && cloudCover == null) {
        cloudCover = await fetchDayCloudCover(chosen.productId);
      }
      const updatedInfo: SceneInfoLike = {
        found: true,
        bestDate: dateStr,
        bestCloudCover: cloudCover ?? 0,
        tileCount: chosen?.tileCount ?? 1,
      };
      if (side === "a") setRenderStateA({ requestedDate: dateStr, info: updatedInfo });
      else setRenderStateB({ requestedDate: dateStr, info: updatedInfo });
      setLabel({
        text: `${prefix} — ${formatDate(dateStr, lang)} · ${(cloudCover ?? 0).toFixed(0)}% ☁`,
        title: t("manualPickTooltip"),
        loading: false,
      });
    },
    [lastOpts, t, lang],
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
    isResolving,
    quotaExceeded,
    labelA,
    labelB,
    datesA,
    datesB,
    renderStateA,
    renderStateB,
    runCompare,
    closeCompare,
    changeMode,
    pickManualDate,
    requestCloudCoverForSide,
    resetSlider,
  };
}

export type UseCompareMapsResult = ReturnType<typeof useCompareMaps>;
