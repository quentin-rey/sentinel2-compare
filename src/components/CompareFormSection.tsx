import { useEffect, useState } from "react";
import type { RenderMode } from "../lib/config";
import type { ScenePriority } from "../lib/earthSearch";
import { useTranslation } from "../hooks/useLanguage";

export type CompareStage = "idle" | "single" | "split";

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
  stage: CompareStage;
  // True from the moment Afficher/Comparer is clicked until the image(s)
  // are actually done rendering (not just metadata-resolved) — disables
  // the trigger buttons for that whole span. Without this, a click while
  // busy silently no-ops (App.tsx's compareBusyRef guard), which reads as
  // "the button doesn't work" rather than "still loading".
  busy: boolean;
  onDisplay: () => void;
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
  stage,
  busy,
  onDisplay,
  onCompare,
  onClose,
}: Props) {
  const { t } = useTranslation();
  // Local to the "single" stage: has the user asked to add a second date yet?
  // Reset whenever we're not in "split" — both dropping all the way back to
  // idle, and "Fermer" stepping back from split to single — so the next
  // journey starts from the collapsed prompt again instead of leaving the
  // date2 field expanded from a previous round.
  const [wantsCompare, setWantsCompare] = useState(false);
  useEffect(() => {
    if (stage !== "split") setWantsCompare(false);
  }, [stage]);

  const showDate2Field = stage === "split" || (stage === "single" && wantsCompare);
  // Quick-date buttons retarget just once, during the "add a second date"
  // sub-step: date1 is already fixed by then, so "−1 week" etc. now picks
  // date2 relative to date1 instead of date1 relative to today/date2 — same
  // buttons, same labels, just a different anchor for that one step.
  const quickDatesTargetDate2 = stage === "single" && wantsCompare;

  function applyQuickDate(days: number) {
    if (quickDatesTargetDate2) {
      const base = new Date(date1 + "T00:00:00Z");
      base.setUTCDate(base.getUTCDate() - days);
      onDate2Change(base.toISOString().slice(0, 10));
      return;
    }
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

      {stage === "single" && !wantsCompare && (
        <button type="button" id="add-compare-date-btn" onClick={() => setWantsCompare(true)}>
          {t("addCompareDatePrompt")}
        </button>
      )}

      {showDate2Field && (
        <label>
          {t("date2Label")}
          <input type="date" id="date2" value={date2} min={date1 || undefined} onChange={(e) => onDate2Change(e.target.value)} />
        </label>
      )}
      <label>
        {t("renderLabel")}
        <select id="mode" value={mode} onChange={(e) => onModeChange(e.target.value as RenderMode)}>
          <option value="true-color">True Color</option>
          <option value="false-color">False Color</option>
          <option value="honc">Highlight Optimized Natural Color</option>
          <option value="fire">Wildfire</option>
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

      {stage === "idle" && (
        <button id="display-btn" onClick={onDisplay} disabled={busy}>
          {t("displayBtn")}
        </button>
      )}
      {showDate2Field && (
        <button id="compare-btn" onClick={onCompare} disabled={busy}>
          {t("compareBtn")}
        </button>
      )}
      {stage === "split" && (
        <button id="close-btn" onClick={onClose} disabled={busy}>
          {t("closeBtn")}
        </button>
      )}
    </>
  );
}
