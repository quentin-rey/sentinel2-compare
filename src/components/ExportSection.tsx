import type { ExportKind } from "./modals/ExportSettingsModal";

export type ExportTarget = "slide" | "before" | "after";

interface Props {
  exportTarget: ExportTarget;
  onExportTargetChange: (value: ExportTarget) => void;
  onOpenExportModal: (kind: ExportKind) => void;
  animatedBusy: boolean;
  progressText: string;
}

export function ExportSection({ exportTarget, onExportTargetChange, onOpenExportModal, animatedBusy, progressText }: Props) {
  return (
    <>
      <label>
        Image
        <select id="export-target" value={exportTarget} onChange={(e) => onExportTargetChange(e.target.value as ExportTarget)}>
          <option value="slide">Comparaison (slide)</option>
          <option value="before">Avant seul</option>
          <option value="after">Après seul</option>
        </select>
      </label>
      <div className="row">
        <button id="export-png-btn" onClick={() => onOpenExportModal("png")}>
          PNG
        </button>
        <button id="export-jpeg-btn" onClick={() => onOpenExportModal("jpeg")}>
          JPEG
        </button>
      </div>
      <p className="export-label">Animation avant ↔ après</p>
      <div className="row">
        <button id="export-gif-btn" className="btn-secondary" disabled={animatedBusy} onClick={() => onOpenExportModal("gif")}>
          GIF animé
        </button>
        <button id="export-webm-btn" className="btn-secondary" disabled={animatedBusy} onClick={() => onOpenExportModal("webm")}>
          Vidéo WebM
        </button>
      </div>
      <p id="export-progress" className={`field-hint${animatedBusy ? "" : " hidden"}`}>
        {progressText}
      </p>
    </>
  );
}
