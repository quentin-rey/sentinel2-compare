interface Props {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

export function InstanceIdModal({ open, value, onChange, onClose }: Props) {
  const active = value.trim().length > 0;

  return (
    <div
      id="instance-id-modal"
      className={`modal-overlay${open ? "" : " hidden"}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="instance-id-modal-title">
        <button id="instance-id-modal-close" className="modal-close" aria-label="Fermer" onClick={onClose}>
          ✕
        </button>
        <h2 id="instance-id-modal-title">Identifiant CDSE personnel</h2>
        <p>
          Par défaut, tous les visiteurs du site partagent le <strong>même quota d'imagerie gratuit</strong> Sentinel
          Hub. Si quelqu'un l'épuise (ou par simple prudence pour ne jamais en dépendre), tu peux utiliser ton propre
          identifiant gratuit à la place — il ne quitte jamais cet appareil.
        </p>

        <p className={`status-line${active ? " status-line-active" : ""}`}>
          {active ? "✓ Identifiant personnel actif — tu utilises ton propre quota." : "Aucun identifiant renseigné — quota partagé utilisé."}
        </p>

        <label>
          Identifiant CDSE (Instance ID)
          <input
            type="text"
            id="custom-instance-id"
            placeholder="Utilise le quota partagé par défaut"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
        {active && (
          <button type="button" className="btn-secondary" onClick={() => onChange("")}>
            Revenir au quota partagé
          </button>
        )}

        <h3>Comment l'obtenir (gratuit, ~5 minutes)</h3>
        <ol className="instance-id-steps">
          <li>
            Crée un compte gratuit sur{" "}
            <a href="https://dataspace.copernicus.eu/" target="_blank" rel="noreferrer">
              dataspace.copernicus.eu
            </a>
            .
          </li>
          <li>
            Ouvre le{" "}
            <a href="https://shapps.dataspace.copernicus.eu/dashboard/#/configurations" target="_blank" rel="noreferrer">
              tableau de bord des configurations
            </a>
            , clique <strong>New configuration</strong> (template Sentinel-2 L2A), donne-lui un nom.
          </li>
          <li>
            Crée-y les 4 layers utilisés par cette app (<code>TRUE-COLOR</code>, <code>FALSE-COLOR</code>,{" "}
            <code>TCO-L2A</code>, <code>WILDFIRE</code>) — les scripts exacts à coller sont dans le{" "}
            <a href="https://github.com/quentin-rey/sentinel2-compare" target="_blank" rel="noreferrer">
              README du projet
            </a>
            . Sans ces layers (mêmes noms), les tuiles resteront vides.
          </li>
          <li>Copie l'Instance ID affiché dans le panneau de la configuration, colle-le dans le champ ci-dessus.</li>
        </ol>
        <p className="modal-footnote">
          Cet identifiant est enregistré uniquement dans le stockage local de ton navigateur (localStorage) —
          jamais envoyé à un serveur applicatif, jamais partagé.
        </p>
      </div>
    </div>
  );
}
