import { useRef } from "react";
import { useTranslation } from "../../hooks/useLanguage";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function InfoModal({ open, onClose }: Props) {
  const { lang, t } = useTranslation();
  // Only close on a click that both started and ended directly on the
  // backdrop — a plain onClick check would also fire after dragging (e.g.
  // selecting text) that starts inside the modal and releases outside it,
  // since a mouseup outside the mousedown's element bubbles the click to
  // their nearest common ancestor, which is this overlay.
  const mouseDownOnOverlay = useRef(false);
  return (
    <div
      id="info-modal"
      className={`modal-overlay${open ? "" : " hidden"}`}
      onMouseDown={(e) => {
        mouseDownOnOverlay.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (mouseDownOnOverlay.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="info-modal-title">
        <button id="info-modal-close" className="modal-close" aria-label={t("closeAriaLabel")} onClick={onClose}>
          ✕
        </button>
        <h2 id="info-modal-title">Sentinel-2 Compare</h2>
        {lang === "fr" ? (
          <>
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
          </>
        ) : (
          <>
            <p>
              Compare how a place has changed over time using Sentinel-2 satellite imagery: pick two dates, drag
              the slider, and see the changes with precision.
            </p>
            <ul>
              <li>
                <strong>Sentinel-2</strong> satellite imagery (Copernicus, the European Earth observation program)
              </li>
              <li>Real acquisition date and cloud cover for each scene</li>
              <li>
                Place search and <strong>OpenStreetMap</strong> basemap
              </li>
            </ul>
            <p className="modal-footnote">
              Your browsing data stays private: no information is sent to an application server, all processing
              happens directly in your browser.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
