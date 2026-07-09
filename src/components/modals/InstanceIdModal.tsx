import { useTranslation } from "../../hooks/useLanguage";

interface Props {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

export function InstanceIdModal({ open, value, onChange, onClose }: Props) {
  const { lang, t } = useTranslation();
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
        <button id="instance-id-modal-close" className="modal-close" aria-label={t("closeAriaLabel")} onClick={onClose}>
          ✕
        </button>
        <h2 id="instance-id-modal-title">{t("instanceIdTitle")}</h2>
        {lang === "fr" ? (
          <p>
            Par défaut, tous les visiteurs du site partagent le <strong>même quota d'imagerie gratuit</strong> Sentinel
            Hub. Si quelqu'un l'épuise (ou par simple prudence pour ne jamais en dépendre), tu peux utiliser ton propre
            identifiant gratuit à la place — il ne quitte jamais cet appareil.
          </p>
        ) : (
          <p>
            By default, all visitors of the site share the <strong>same free Sentinel Hub imagery quota</strong>. If
            someone exhausts it (or simply as a precaution to never depend on it), you can use your own free ID
            instead — it never leaves this device.
          </p>
        )}

        <p className={`status-line${active ? " status-line-active" : ""}`}>
          {active ? t("instanceIdActiveStatus") : t("instanceIdInactiveStatus")}
        </p>

        <label>
          {t("instanceIdFieldLabel")}
          <input
            type="text"
            id="custom-instance-id"
            placeholder={t("instanceIdPlaceholder")}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
        {active && (
          <button type="button" className="btn-secondary" onClick={() => onChange("")}>
            {t("instanceIdRevert")}
          </button>
        )}

        <h3>{t("instanceIdHowTo")}</h3>
        {lang === "fr" ? (
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
        ) : (
          <ol className="instance-id-steps">
            <li>
              Create a free account on{" "}
              <a href="https://dataspace.copernicus.eu/" target="_blank" rel="noreferrer">
                dataspace.copernicus.eu
              </a>
              .
            </li>
            <li>
              Open the{" "}
              <a href="https://shapps.dataspace.copernicus.eu/dashboard/#/configurations" target="_blank" rel="noreferrer">
                configurations dashboard
              </a>
              , click <strong>New configuration</strong> (Sentinel-2 L2A template), give it a name.
            </li>
            <li>
              Create the 4 layers used by this app in it (<code>TRUE-COLOR</code>, <code>FALSE-COLOR</code>,{" "}
              <code>TCO-L2A</code>, <code>WILDFIRE</code>) — the exact scripts to paste are in the{" "}
              <a href="https://github.com/quentin-rey/sentinel2-compare" target="_blank" rel="noreferrer">
                project README
              </a>
              . Without these layers (same names), the tiles will stay blank.
            </li>
            <li>Copy the Instance ID shown in the configuration's panel, paste it into the field above.</li>
          </ol>
        )}
        {lang === "fr" ? (
          <p className="modal-footnote">
            Cet identifiant est enregistré uniquement dans le stockage local de ton navigateur (localStorage) —
            jamais envoyé à un serveur applicatif, jamais partagé.
          </p>
        ) : (
          <p className="modal-footnote">
            This ID is stored only in your browser's local storage (localStorage) — never sent to an application
            server, never shared.
          </p>
        )}
      </div>
    </div>
  );
}
