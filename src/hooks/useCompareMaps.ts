import { useCallback, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { wmtsTileUrl, dayRange } from "../lib/wmts";
import { loadSceneData, fetchDayCloudCover, type Bbox, type SceneDate } from "../lib/stacInfo";
import { createSwipe, type SwipeControl } from "../lib/swipe";
import type { RenderMode } from "../lib/config";
import { formatDate } from "../utils/format";

export interface CompareOpts {
  maxCloud: number;
  windowDays: number;
  priority: "closest" | "leastcloud";
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
    return { timeRange: dayRange(info.bestDate), maxCloud: 100, priority: "mostRecent" as const };
  }
  if (info.unknown) {
    const target = new Date(requestedDate + "T00:00:00Z");
    const start = new Date(target.getTime() - opts.windowDays * 86400000).toISOString().slice(0, 10);
    const end = new Date(target.getTime() + opts.windowDays * 86400000).toISOString().slice(0, 10);
    return {
      timeRange: `${start}/${end}`,
      maxCloud: opts.priority === "leastcloud" ? opts.maxCloud : 100,
      priority: (opts.priority === "leastcloud" ? "leastCC" : "mostRecent") as "leastCC" | "mostRecent",
    };
  }
  return null;
}

function describeScene(label: string, requestedDate: string, info: SceneInfoLike): string {
  if (info.unknown) return `${label}: ~${formatDate(requestedDate)} (métadonnées indisponibles, date approximative).`;
  if (!info.found) return `⚠️ ${label}: aucune image trouvée près du ${formatDate(requestedDate)}.`;
  return `${label}: ${formatDate(info.bestDate)} (nuages ${info.bestCloudCover.toFixed(0)}%, ${info.tileCount} dalle(s)).`;
}

function labelFor(prefix: string, requestedDate: string, info: SceneInfoLike, opts: CompareOpts): string {
  if (info.unknown) return `${prefix} — ~${formatDate(requestedDate)}`;
  if (!info.found) return `${prefix} — aucune image`;
  const approx = opts.priority === "leastcloud" ? " ≈" : "";
  return `${prefix}${approx} — ${formatDate(info.bestDate)} · ${info.bestCloudCover.toFixed(0)}% ☁`;
}

function sceneTooltip(requestedDate: string, info: SceneInfoLike, opts: CompareOpts): string {
  if (info.unknown) {
    return `Requête pour le ${formatDate(requestedDate)}. Métadonnées indisponibles : rendu de secours sur une fenêtre de ±${opts.windowDays}j.`;
  }
  if (!info.found) {
    return `Aucune scène trouvée dans une fenêtre de ±${opts.windowDays}j autour du ${formatDate(requestedDate)}.`;
  }
  const priorityLabel = opts.priority === "leastcloud" ? "image la moins nuageuse" : "date la plus proche";
  return `Demandé : ${formatDate(requestedDate)}. Priorité : ${priorityLabel}. Fenêtre de recherche : ±${opts.windowDays} jours.`;
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

  const [isOpen, setIsOpen] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [labelA, setLabelA] = useState<LabelState>(DEFAULT_LABEL);
  const [labelB, setLabelB] = useState<LabelState>(DEFAULT_LABEL);
  const [datesA, setDatesA] = useState<SceneDate[]>([]);
  const [datesB, setDatesB] = useState<SceneDate[]>([]);
  const [renderStateA, setRenderStateA] = useState<SideRenderState | null>(null);
  const [renderStateB, setRenderStateB] = useState<SideRenderState | null>(null);
  const [lastOpts, setLastOpts] = useState<CompareOpts | null>(null);

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
      setLabelA({ text: "Avant — chargement…", title: "", loading: true });
      setLabelB({ text: "Après — chargement…", title: "", loading: true });
      setDatesA([]);
      setDatesB([]);
      cloudLoadStartedRef.current = { a: false, b: false };

      const inst = instancesRef.current;
      inst.mapA?.remove();
      inst.mapB?.remove();
      inst.swipe = null;

      if (!mapAContainerRef.current || !mapBContainerRef.current) {
        // Should be unreachable — the containers are always mounted (see
        // module doc comment) — but keeps the return type total.
        setIsOpen(false);
        return { statusMessage: "Erreur interne : conteneurs de carte introuvables.", hasWarning: true };
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

      setLabelA({ text: labelFor("Avant", date1, infoA, opts), title: sceneTooltip(date1, infoA, opts), loading: false });
      setLabelB({ text: labelFor("Après", date2, infoB, opts), title: sceneTooltip(date2, infoB, opts), loading: false });
      setDatesA(sceneA.dates);
      setDatesB(sceneB.dates);
      setRenderStateA({ requestedDate: date1, info: infoA });
      setRenderStateB({ requestedDate: date2, info: infoB });
      setLastOpts(opts);

      const hasWarning = !infoA.found || !infoB.found;
      return {
        statusMessage: `${describeScene("Avant", date1, infoA)} ${describeScene("Après", date2, infoB)}`,
        hasWarning,
      };
    },
    [addCompareLayer, swapLayerMode],
  );

  const closeCompare = useCallback(() => {
    setIsOpen(false);
    setIsResolving(false);
    const inst = instancesRef.current;
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
      const prefix = side === "a" ? "Avant" : "Après";
      const source = mapInstance?.getSource(key) as maplibregl.RasterTileSource | undefined;
      if (!mapInstance || !dateStr || !source) return;

      const params = { timeRange: dayRange(dateStr), maxCloud: 100, priority: "mostRecent" as const };
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
        text: `${prefix} — ${formatDate(dateStr)} · ${(cloudCover ?? 0).toFixed(0)}% ☁`,
        title: "Date choisie manuellement parmi les scènes disponibles.",
        loading: false,
      });
    },
    [],
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
