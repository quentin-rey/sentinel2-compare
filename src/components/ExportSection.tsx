import { useTranslation } from "../hooks/useLanguage";
import type { ExportKind } from "./modals/ExportSettingsModal";

export type ExportTarget = "slide" | "before" | "after";

interface Props {
  // The wizard's single-image stage (issue #4) — no second image, so the
  // before/after/slide target picker and the before↔after animation exports
  // don't apply; only a plain PNG/JPEG of the one image shown.
  single: boolean;
  exportTarget: ExportTarget;
  onExportTargetChange: (value: ExportTarget) => void;
  onOpenExportModal: (kind: ExportKind) => void;
  animatedBusy: boolean;
  progressText: string;
  // null = indeterminate (spinner only), 0-100 = show a progress bar too.
  progressPercent: number | null;
}

export function ExportSection({ single, exportTarget, onExportTargetChange, onOpenExportModal, animatedBusy, progressText, progressPercent }: Props) {
  const { t } = useTranslation();
  return (
    <>
      {!single && (
        <label>
          {t("exportImageLabel")}
          <select id="export-target" value={exportTarget} onChange={(e) => onExportTargetChange(e.target.value as ExportTarget)}>
            <option value="slide">{t("exportImageSlide")}</option>
            <option value="before">{t("exportImageBefore")}</option>
            <option value="after">{t("exportImageAfter")}</option>
          </select>
        </label>
      )}
      <div className="row">
        <button id="export-png-btn" onClick={() => onOpenExportModal("png")}>
          {t("exportPng")}
        </button>
        <button id="export-jpeg-btn" onClick={() => onOpenExportModal("jpeg")}>
          {t("exportJpeg")}
        </button>
      </div>
      {!single && (
        <>
          <p className="export-label">{t("exportAnimationLabel")}</p>
          <div className="row">
            <button id="export-gif-btn" disabled={animatedBusy} onClick={() => onOpenExportModal("gif")}>
              {t("exportGif")}
            </button>
            <button id="export-webm-btn" disabled={animatedBusy} onClick={() => onOpenExportModal("webm")}>
              {t("exportWebm")}
            </button>
          </div>
        </>
      )}
      <div id="export-progress" className={`export-progress${animatedBusy ? "" : " hidden"}`}>
        <div className="export-progress-row">
          <span className="export-progress-spinner" aria-hidden="true" />
          <span className="export-progress-text">{progressText}</span>
        </div>
        {progressPercent !== null && (
          <div className="export-progress-track">
            <div className="export-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        )}
      </div>
    </>
  );
}
