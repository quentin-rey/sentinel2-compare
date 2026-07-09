import type { RenderMode } from "../lib/config";
import type { ScenePriority } from "../lib/stacInfo";
import { useTranslation } from "../hooks/useLanguage";

interface Props {
  date1: string;
  date2: string;
  onDate1Change: (value: string) => void;
  onDate2Change: (value: string) => void;
  mode: RenderMode;
  onModeChange: (value: RenderMode) => void;
  priority: ScenePriority;
  onPriorityChange: (value: ScenePriority) => void;
  maxCloud: string;
  onMaxCloudChange: (value: string) => void;
  windowDays: string;
  onWindowDaysChange: (value: string) => void;
  isComparing: boolean;
  onCompare: () => void;
  onClose: () => void;
}

export function CompareFormSection({
  date1,
  date2,
  onDate1Change,
  onDate2Change,
  mode,
  onModeChange,
  priority,
  onPriorityChange,
  maxCloud,
  onMaxCloudChange,
  windowDays,
  onWindowDaysChange,
  isComparing,
  onCompare,
  onClose,
}: Props) {
  const { t } = useTranslation();

  function applyQuickDate(days: number) {
    const base = date2 ? new Date(date2 + "T00:00:00Z") : new Date();
    base.setUTCDate(base.getUTCDate() - days);
    onDate1Change(base.toISOString().slice(0, 10));
  }

  return (
    <>
      <label>
        {t("date1Label")}
        <input type="date" id="date1" value={date1} max={date2 || undefined} onChange={(e) => onDate1Change(e.target.value)} />
      </label>
      <div className="row quick-dates">
        <button type="button" className="btn-secondary quick-date-btn" onClick={() => applyQuickDate(7)}>
          {t("quickWeek")}
        </button>
        <button type="button" className="btn-secondary quick-date-btn" onClick={() => applyQuickDate(30)}>
          {t("quickMonth")}
        </button>
        <button type="button" className="btn-secondary quick-date-btn" onClick={() => applyQuickDate(365)}>
          {t("quickYear")}
        </button>
      </div>
      <label>
        {t("date2Label")}
        <input type="date" id="date2" value={date2} min={date1 || undefined} onChange={(e) => onDate2Change(e.target.value)} />
      </label>
      <label>
        {t("renderLabel")}
        <select id="mode" value={mode} onChange={(e) => onModeChange(e.target.value as RenderMode)}>
          <option value="true-color">True Color</option>
          <option value="false-color">False Color</option>
          <option value="honc">Highlight Optimized Natural Color</option>
          <option value="fire">Wildfire (CDSE)</option>
        </select>
      </label>
      <label>
        {t("priorityLabel")}
        <select id="priority" value={priority} onChange={(e) => onPriorityChange(e.target.value as ScenePriority)}>
          <option value="closest">{t("priorityClosest")}</option>
          <option value="leastcloud">{t("priorityLeastCloud")}</option>
        </select>
      </label>
      <p id="priority-hint" className={`field-hint${priority === "closest" ? " hidden" : ""}`}>
        {t("priorityHint")}
      </p>

      <details id="advanced-details">
        <summary>{t("advancedSettings")}</summary>
        <div className="row">
          <label>
            {t("maxCloudLabel")}
            <input
              type="number"
              id="max-cloud"
              min={0}
              max={100}
              value={maxCloud}
              title={priority === "closest" ? t("maxCloudTooltip") : ""}
              onChange={(e) => onMaxCloudChange(e.target.value)}
            />
          </label>
          <label>
            {t("windowDaysLabel")}
            <input type="number" id="window-days" min={1} max={90} value={windowDays} onChange={(e) => onWindowDaysChange(e.target.value)} />
          </label>
        </div>
      </details>

      <button id="compare-btn" onClick={onCompare}>
        {t("compareBtn")}
      </button>
      <button id="close-btn" className={isComparing ? "" : "hidden"} onClick={onClose}>
        {t("closeBtn")}
      </button>
    </>
  );
}
