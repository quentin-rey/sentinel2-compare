import type { UseCompareMapsResult } from "../hooks/useCompareMaps";
import type { RenderMode } from "../lib/config";
import { CompareLabel } from "./CompareLabel";

interface Props {
  compare: UseCompareMapsResult;
  mode: RenderMode;
}

export function CompareView({ compare, mode }: Props) {
  const {
    mapAContainerRef,
    mapBContainerRef,
    mapBWrapRef,
    swiperRef,
    containerRef,
    isOpen,
    isResolving,
    labelA,
    labelB,
    datesA,
    datesB,
    renderStateA,
    renderStateB,
    pickManualDate,
    requestCloudCoverForSide,
    resetSlider,
  } = compare;

  const totalTilesA = renderStateA?.info.found ? renderStateA.info.tileCount : 1;
  const totalTilesB = renderStateB?.info.found ? renderStateB.info.tileCount : 1;

  return (
    <div id="compare" ref={containerRef} className={isOpen ? "" : "hidden"}>
      <div id="map-a" ref={mapAContainerRef} className="compare-map" />
      <div id="map-b-wrap" ref={mapBWrapRef} className="compare-map-wrap">
        <div id="map-b" ref={mapBContainerRef} className="compare-map" />
      </div>
      <div
        id="swiper"
        ref={swiperRef}
        tabIndex={0}
        role="slider"
        aria-label="Curseur de comparaison"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={50}
        onDoubleClick={resetSlider}
      />
      <button
        id="reset-slider-btn"
        className={isOpen ? "" : "hidden"}
        title="Recentrer le slider (ou double-clic sur le curseur)"
        onClick={resetSlider}
      >
        ⟲
      </button>
      <div id="compare-loading-banner" className={isResolving ? "" : "hidden"}>
        <span className="banner-spinner" />
        Chargement des dates exactes en cours… l'aperçu affiché peut être approximatif.
      </div>
      <CompareLabel
        side="a"
        text={labelA.text}
        title={labelA.title}
        loading={labelA.loading}
        dates={datesA}
        totalTiles={totalTilesA}
        selectedDate={renderStateA?.info.found ? renderStateA.info.bestDate : undefined}
        onSelectDate={(date) => pickManualDate("a", date, mode, datesA)}
        onOpenPicker={() => requestCloudCoverForSide("a")}
      />
      <CompareLabel
        side="b"
        text={labelB.text}
        title={labelB.title}
        loading={labelB.loading}
        dates={datesB}
        totalTiles={totalTilesB}
        selectedDate={renderStateB?.info.found ? renderStateB.info.bestDate : undefined}
        onSelectDate={(date) => pickManualDate("b", date, mode, datesB)}
        onOpenPicker={() => requestCloudCoverForSide("b")}
      />
    </div>
  );
}
