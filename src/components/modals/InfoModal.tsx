interface Props {
  open: boolean;
  onClose: () => void;
}

export function InfoModal({ open, onClose }: Props) {
  return (
    <div
      id="info-modal"
      className={`modal-overlay${open ? "" : " hidden"}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="info-modal-title">
        <button id="info-modal-close" className="modal-close" aria-label="Fermer" onClick={onClose}>
          ✕
        </button>
        <h2 id="info-modal-title">Sentinel-2 Compare</h2>
        <p>
          Comparez l'évolution d'un lieu dans le temps grâce aux images satellite Sentinel-2 : choisissez deux
          dates, glissez le curseur, et observez les changements avec précision.
        </p>
        <ul>
          <li>
            Imagerie satellite <strong>Sentinel-2</strong> (Copernicus, programme spatial européen d'observation
            de la Terre)
          </li>
          <li>Dates et taux de nuages réels de chaque prise de vue</li>
          <li>
            Recherche de lieu et fond de carte <strong>OpenStreetMap</strong>
          </li>
        </ul>
        <p className="modal-footnote">
          Vos données de navigation restent privées : aucune information n'est envoyée à un serveur applicatif,
          tout le traitement se fait directement dans votre navigateur.
        </p>
      </div>
    </div>
  );
}
