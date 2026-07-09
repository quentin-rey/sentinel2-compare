import type { RenderMode } from "../lib/config";
import type { ScenePriority } from "../lib/stacInfo";

interface Props {
  date1: string;
  date2: string;
  onDate1Change: (value: string) => void;
  onDate2Change: (value: string) => void;
  mode: RenderMode;
  onModeChange: (value: RenderMode) => void;
  priority: ScenePriority;
  onPriorityChange: (value: ScenePriority) => void;
  maxCloud: string;
  onMaxCloudChange: (value: string) => void;
  windowDays: string;
  onWindowDaysChange: (value: string) => void;
  isComparing: boolean;
  onCompare: () => void;
  onClose: () => void;
}

export function CompareFormSection({
  date1,
  date2,
  onDate1Change,
  onDate2Change,
  mode,
  onModeChange,
  priority,
  onPriorityChange,
  maxCloud,
  onMaxCloudChange,
  windowDays,
  onWindowDaysChange,
  isComparing,
  onCompare,
  onClose,
}: Props) {
  function applyQuickDate(days: number) {
    const base = date2 ? new Date(date2 + "T00:00:00Z") : new Date();
    base.setUTCDate(base.getUTCDate() - days);
    onDate1Change(base.toISOString().slice(0, 10));
  }

  return (
    <>
      <label>
        Date 1 (avant)
        <input type="date" id="date1" value={date1} max={date2 || undefined} onChange={(e) => onDate1Change(e.target.value)} />
      </label>
      <div className="row quick-dates">
        <button type="button" className="btn-secondary quick-date-btn" onClick={() => applyQuickDate(7)}>
          −1 sem
        </button>
        <button type="button" className="btn-secondary quick-date-btn" onClick={() => applyQuickDate(30)}>
          −1 mois
        </button>
        <button type="button" className="btn-secondary quick-date-btn" onClick={() => applyQuickDate(365)}>
          −1 an
        </button>
      </div>
      <label>
        Date 2 (après)
        <input type="date" id="date2" value={date2} min={date1 || undefined} onChange={(e) => onDate2Change(e.target.value)} />
      </label>
      <label>
        Rendu
        <select id="mode" value={mode} onChange={(e) => onModeChange(e.target.value as RenderMode)}>
          <option value="true-color">True Color</option>
          <option value="false-color">False Color</option>
          <option value="honc">Highlight Optimized Natural Color</option>
          <option value="fire">Wildfire (CDSE)</option>
        </select>
      </label>
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

      <details id="advanced-details">
        <summary>Réglages avancés</summary>
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
      </details>

      <button id="compare-btn" onClick={onCompare}>
        Comparer
      </button>
      <button id="close-btn" className={isComparing ? "" : "hidden"} onClick={onClose}>
        Fermer la comparaison
      </button>
    </>
  );
}
