interface Props {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ open, onClose }: Props) {
  return (
    <div
      id="shortcuts-modal"
      className={`modal-overlay${open ? "" : " hidden"}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-modal-title">
        <button id="shortcuts-modal-close" className="modal-close" aria-label="Fermer" onClick={onClose}>
          ✕
        </button>
        <h2 id="shortcuts-modal-title">Raccourcis clavier</h2>
        <ul className="shortcuts-list">
          <li>
            <kbd>M</kbd> Basculer le menu
          </li>
          <li>
            <kbd>Échap</kbd> Fermer la comparaison ou une fenêtre ouverte
          </li>
          <li>
            <kbd>←</kbd> / <kbd>→</kbd> Déplacer le slider
          </li>
          <li>
            <kbd>Maj</kbd> + <kbd>←</kbd>/<kbd>→</kbd> Déplacer le slider plus vite
          </li>
          <li>Double-clic sur le curseur : le recentrer</li>
        </ul>
      </div>
    </div>
  );
}
