import { useTranslation } from "../../hooks/useLanguage";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  return (
    <div
      id="shortcuts-modal"
      className={`modal-overlay${open ? "" : " hidden"}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-modal-title">
        <button id="shortcuts-modal-close" className="modal-close" aria-label={t("closeAriaLabel")} onClick={onClose}>
          ✕
        </button>
        <h2 id="shortcuts-modal-title">{t("shortcutsTitle")}</h2>
        <ul className="shortcuts-list">
          <li>
            <kbd>M</kbd> {t("shortcutMenu")}
          </li>
          <li>
            <kbd>{t("kbdEscape")}</kbd> {t("shortcutClose")}
          </li>
          <li>
            <kbd>←</kbd> / <kbd>→</kbd> {t("shortcutSlider")}
          </li>
          <li>
            <kbd>{t("kbdShift")}</kbd> + <kbd>←</kbd>/<kbd>→</kbd> {t("shortcutSliderFast")}
          </li>
          <li>{t("shortcutRecenter")}</li>
        </ul>
      </div>
    </div>
  );
}
