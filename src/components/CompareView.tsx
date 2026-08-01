import type { UseCompareMapsResult } from "../hooks/useCompareMaps";
import type { RenderMode } from "../lib/config";
import { CompareLabel } from "./CompareLabel";
import { useTranslation } from "../hooks/useLanguage";

interface Props {
  compare: UseCompareMapsResult;
  mode: RenderMode;
  // Manually picking a date from a label's dropdown (the "infobulle" picker)
  // only updated the rendered scene, not App.tsx's date1/date2 — so the
  // share link and a later "Comparer" click both silently reverted to the
  // sidebar's original dates instead of the one actually being shown. This
  // keeps them in sync with whatever's picked here.
  onManualDateChange: (side: "a" | "b", date: string) => void;
}

export function CompareView({ compare, mode, onManualDateChange }: Props) {
  const { t } = useTranslation();
  const {
    mapAContainerRef,
    mapBContainerRef,
    mapBWrapRef,
    swiperRef,
    containerRef,
    isOpen,
    isComparing,
    isResolving,
    labelA,
    labelB,
    datesA,
    datesB,
    renderStateA,
    renderStateB,
    pickManualDate,
    resetSlider,
    zoomIn,
    zoomOut,
  } = compare;

  const totalTilesA = renderStateA?.info.found ? renderStateA.info.tileCount : 1;
  const totalTilesB = renderStateB?.info.found ? renderStateB.info.tileCount : 1;

  return (
    <div id="compare" ref={containerRef} className={isOpen ? "" : "hidden"}>
      <div id="map-a" ref={mapAContainerRef} className="compare-map" />
      {/* Always mounted whenever #compare is (mapBContainerRef/swiperRef must
          already exist in the DOM the moment runCompare() upgrades a single
          view into a comparison — see useCompareMaps.ts's module doc comment
          on the same DOM-timing constraint for mapA/#compare itself). Only
          *visually* hidden in single mode; no mapB MapLibre instance exists
          until isComparing, so there's no extra rendering cost. */}
      <div id="map-b-wrap" ref={mapBWrapRef} className={`compare-map-wrap${isComparing ? "" : " hidden"}`}>
        <div id="map-b" ref={mapBContainerRef} className="compare-map" />
      </div>
      <div
        id="swiper"
        ref={swiperRef}
        tabIndex={0}
        role="slider"
        aria-label={t("compareSliderAriaLabel")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={50}
        onDoubleClick={resetSlider}
        className={isComparing ? "" : "hidden"}
      />
      {/* A real maplibregl.NavigationControl added to mapA/mapB individually
          ends up hidden or fighting for clicks with the other side — mapB's
          canvas paints over mapA's right half while comparing (the clip-path
          on .compare-map-wrap), but that same clip-path also traps mapB's
          own control in a separate local stacking context, so mapA's control
          escapes on top of it instead. Reusing maplibre-gl.css's own
          `.maplibregl-ctrl-*` classes (not scoped to any one map's DOM) on a
          single control living directly in #compare sidesteps all of that —
          one control, positioned like maplibre's own, driving mapA's camera
          (zoomIn/zoomOut in useCompareMaps.ts), which the swipe control's
          camera sync then mirrors onto mapB. */}
      {isOpen && (
        <div className="maplibregl-ctrl-top-right">
          <div className="maplibregl-ctrl maplibregl-ctrl-group">
            <button type="button" className="maplibregl-ctrl-zoom-in" title={t("zoomInAriaLabel")} aria-label={t("zoomInAriaLabel")} onClick={zoomIn}>
              <span className="maplibregl-ctrl-icon" aria-hidden="true" />
            </button>
            <button type="button" className="maplibregl-ctrl-zoom-out" title={t("zoomOutAriaLabel")} aria-label={t("zoomOutAriaLabel")} onClick={zoomOut}>
              <span className="maplibregl-ctrl-icon" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      <div id="compare-loading-banner" className={isResolving ? "" : "hidden"}>
        <span className="banner-spinner" />
        {t("loadingExactDatesBanner")}
      </div>
      <CompareLabel
        side="a"
        text={labelA.text}
        title={labelA.title}
        loading={labelA.loading}
        dates={datesA}
        totalTiles={totalTilesA}
        selectedDate={renderStateA?.info.found ? renderStateA.info.bestDate : undefined}
        onSelectDate={(date) => {
          pickManualDate("a", date, mode, datesA);
          onManualDateChange("a", date);
        }}
      />
      {isComparing && (
        <CompareLabel
          side="b"
          text={labelB.text}
          title={labelB.title}
          loading={labelB.loading}
          dates={datesB}
          totalTiles={totalTilesB}
          selectedDate={renderStateB?.info.found ? renderStateB.info.bestDate : undefined}
          onSelectDate={(date) => {
            pickManualDate("b", date, mode, datesB);
            onManualDateChange("b", date);
          }}
        />
      )}
    </div>
  );
}
