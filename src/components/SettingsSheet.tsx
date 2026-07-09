import { useEffect, useRef } from "react";
import type { ScenePriority } from "../lib/stacInfo";
import { ExportSection, type ExportTarget } from "./ExportSection";
import type { ExportKind } from "./modals/ExportSettingsModal";

interface Props {
  open: boolean;
  onClose: () => void;
  // The ⚙ button that opens this sheet — excluded from the outside-click
  // check below so the same click that opens the sheet (dispatched from
  // outside sheetRef's subtree) doesn't also immediately close it.
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  priority: ScenePriority;
  onPriorityChange: (value: ScenePriority) => void;
  maxCloud: string;
  onMaxCloudChange: (value: string) => void;
  windowDays: string;
  onWindowDaysChange: (value: string) => void;
  isComparing: boolean;
  exportTarget: ExportTarget;
  onExportTargetChange: (value: ExportTarget) => void;
  onOpenExportModal: (kind: ExportKind) => void;
  animatedBusy: boolean;
  progressText: string;
  onShare: () => void;
  onOpenInstanceId: () => void;
  hasCustomInstanceId: boolean;
}

export function SettingsSheet({
  open,
  onClose,
  triggerRef,
  priority,
  onPriorityChange,
  maxCloud,
  onMaxCloudChange,
  windowDays,
  onWindowDaysChange,
  isComparing,
  exportTarget,
  onExportTargetChange,
  onOpenExportModal,
  animatedBusy,
  progressText,
  onShare,
  onOpenInstanceId,
  hasCustomInstanceId,
}: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Not a dimmed modal — the map behind it stays visible/interactive, so
  // there's no full-screen backdrop to catch outside clicks on. Detect them
  // directly instead (same pattern as SearchOverlay). The ⚙ trigger button
  // lives outside sheetRef's own subtree (it's in TopBar, a sibling
  // component), so it must be excluded explicitly — otherwise the very
  // click that opens the sheet also fires this listener (React flushes
  // effects before the native event finishes bubbling to `document`) and
  // immediately closes it again.
  useEffect(() => {
    if (!open) return;
    function handleDocumentClick(e: MouseEvent) {
      const target = e.target as Node;
      if (sheetRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, [open, onClose, triggerRef]);

  return (
    <div id="settings-sheet-wrap" className={open ? "open" : "hidden"}>
      <div id="settings-sheet" ref={sheetRef} role="dialog" aria-modal="false" aria-labelledby="settings-sheet-title">
        <div className="settings-sheet-header">
          <h2 id="settings-sheet-title">Réglages</h2>
          <button id="settings-sheet-close" className="modal-close" aria-label="Fermer" onClick={onClose}>
            ✕
          </button>
        </div>

        <section className="panel-section">
          <label>
            Priorité de sélection
            <select id="priority" value={priority} onChange={(e) => onPriorityChange(e.target.value as ScenePriority)}>
              <option value="closest">Date la plus proche</option>
              <option value="leastcloud">Moins nuageux</option>
            </select>
          </label>
          <p id="priority-hint" className={`field-hint${priority === "closest" ? " hidden" : ""}`}>
            ⚠️ La date affichée peut différer de la date demandée (priorité donnée à l'image la plus claire).
          </p>
          <div className="row">
            <label>
              Nuages max (%)
              <input
                type="number"
                id="max-cloud"
                min={0}
                max={100}
                value={maxCloud}
                title={
                  priority === "closest"
                    ? 'En mode "Date la plus proche" : préférence, pas une exclusion — si aucune date proche ne passe sous ce seuil, la date la plus proche s\'affiche quand même (ex. fumée d\'incendie).'
                    : ""
                }
                onChange={(e) => onMaxCloudChange(e.target.value)}
              />
            </label>
            <label>
              Fenêtre (jours)
              <input type="number" id="window-days" min={1} max={90} value={windowDays} onChange={(e) => onWindowDaysChange(e.target.value)} />
            </label>
          </div>
        </section>

        <section className="panel-section">
          <h2 className="section-title">Identifiant CDSE</h2>
          <button type="button" className="btn-secondary" onClick={onOpenInstanceId}>
            {hasCustomInstanceId ? "✓ Identifiant personnel actif" : "Utiliser mon propre identifiant"}
          </button>
        </section>

        <ExportSection
          visible={isComparing}
          exportTarget={exportTarget}
          onExportTargetChange={onExportTargetChange}
          onOpenExportModal={onOpenExportModal}
          animatedBusy={animatedBusy}
          progressText={progressText}
        />

        <button id="share-btn" onClick={onShare}>
          Copier le lien de partage
        </button>
      </div>
    </div>
  );
}
