import { useTranslation } from "../hooks/useLanguage";

interface Props {
  showDepartements: boolean;
  onShowDepartementsChange: (value: boolean) => void;
  departementsOpacity: number;
  onDepartementsOpacityChange: (value: number) => void;
  showVilles: boolean;
  onShowVillesChange: (value: boolean) => void;
  villesMinPopulation: number;
  onVillesMinPopulationChange: (value: number) => void;
  villesTextColor: string;
  onVillesTextColorChange: (value: string) => void;
  villesHalo: boolean;
  onVillesHaloChange: (value: boolean) => void;
  villesSizeScale: number;
  onVillesSizeScaleChange: (value: number) => void;
}

// Discrete population floor steps (log-ish spacing — population is heavily
// skewed, a linear slider would waste all its range on the low end). Index
// into this array is what the <input type="range"> actually carries.
const POPULATION_STEPS = [0, 1000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];

// Just the two extremes rather than a full color picker — the halo always
// takes the opposite of whichever one is picked (see adminLayers.ts's
// haloColorFor), so there's no contrast combination to get wrong here.
const TEXT_COLOR_SWATCHES = ["#000000", "#ffffff"];

function Switch({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="layer-switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="layer-switch-track">
        <span className="layer-switch-thumb" />
      </span>
    </label>
  );
}

export function LayersSection({
  showDepartements,
  onShowDepartementsChange,
  departementsOpacity,
  onDepartementsOpacityChange,
  showVilles,
  onShowVillesChange,
  villesMinPopulation,
  onVillesMinPopulationChange,
  villesTextColor,
  onVillesTextColorChange,
  villesHalo,
  onVillesHaloChange,
  villesSizeScale,
  onVillesSizeScaleChange,
}: Props) {
  const { t, lang } = useTranslation();
  const numberFormat = new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US");
  const populationStepIndex = Math.max(0, POPULATION_STEPS.indexOf(villesMinPopulation));

  return (
    <div className="layers-section">
      <div className={`layer-card${showDepartements ? " active" : ""}`}>
        <div className="layer-card-header">
          <span className="layer-card-title">{t("layerDepartementsLabel")}</span>
          <Switch checked={showDepartements} onChange={onShowDepartementsChange} />
        </div>
        {showDepartements && (
          <div className="layer-card-body">
            <div className="layer-control-row">
              <span>{t("layerOpacityLabel")}</span>
              <span className="layer-control-value">{Math.round(departementsOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              className="layer-range"
              min={0}
              max={1}
              step={0.05}
              value={departementsOpacity}
              onChange={(e) => onDepartementsOpacityChange(Number(e.target.value))}
            />
          </div>
        )}
      </div>

      <div className={`layer-card${showVilles ? " active" : ""}`}>
        <div className="layer-card-header">
          <span className="layer-card-title">{t("layerVillesLabel")}</span>
          <Switch checked={showVilles} onChange={onShowVillesChange} />
        </div>
        {showVilles && (
          <div className="layer-card-body">
            <div className="layer-control-row">
              <span>{t("layerVillesCountLabel")}</span>
              <span className="layer-control-value">
                {villesMinPopulation === 0
                  ? t("layerVillesMinPopulationAll")
                  : t("layerVillesMinPopulationValue", { population: numberFormat.format(villesMinPopulation) })}
              </span>
            </div>
            <input
              type="range"
              className="layer-range"
              min={0}
              max={POPULATION_STEPS.length - 1}
              step={1}
              value={populationStepIndex}
              onChange={(e) => onVillesMinPopulationChange(POPULATION_STEPS[Number(e.target.value)])}
            />
            <p className="layer-hint">{t("layerVillesZoomHint")}</p>

            <details className="layer-advanced">
              <summary>{t("advancedSettings")}</summary>

              <div className="layer-control-row layer-control-row-spaced">
                <span>{t("layerVillesColorLabel")}</span>
              </div>
              <div className="layer-swatches">
                {TEXT_COLOR_SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`layer-swatch${color === villesTextColor ? " selected" : ""}`}
                    style={{ background: color }}
                    aria-label={color}
                    onClick={() => onVillesTextColorChange(color)}
                  />
                ))}
              </div>

              <div className="layer-control-row layer-control-row-spaced">
                <span>{t("layerVillesHaloLabel")}</span>
                <Switch checked={villesHalo} onChange={onVillesHaloChange} />
              </div>

              <div className="layer-control-row layer-control-row-spaced">
                <span>{t("layerVillesSizeLabel")}</span>
                <span className="layer-control-value">{Math.round(villesSizeScale * 100)}%</span>
              </div>
              <input
                type="range"
                className="layer-range"
                min={0.6}
                max={1.8}
                step={0.1}
                value={villesSizeScale}
                onChange={(e) => onVillesSizeScaleChange(Number(e.target.value))}
              />
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
