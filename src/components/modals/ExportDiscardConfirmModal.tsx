import { useTranslation } from "../../hooks/useLanguage";

interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// A custom in-page modal instead of window.confirm() — a native confirm()
// dialog opened from a keydown handler races the Escape key's own keyup,
// which browsers deliver to the dialog and treat as an instant "Cancel"
// (so the prompt closes itself before the user can actually decide). A
// plain DOM element has no such native-dialog/keyboard interaction quirk.
export function ExportDiscardConfirmModal({ open, onCancel, onConfirm }: Props) {
  const { t } = useTranslation();
  return (
    <div
      id="export-discard-modal"
      className={`modal-overlay${open ? "" : " hidden"}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="export-discard-title">
        <h2 id="export-discard-title">{t("discardTitle")}</h2>
        <p>{t("discardBody")}</p>
        <div className="row">
          <button id="export-discard-cancel" className="btn-secondary" onClick={onCancel}>
            {t("discardCancel")}
          </button>
          <button id="export-discard-confirm" onClick={onConfirm}>
            {t("discardConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
