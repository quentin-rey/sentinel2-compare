import { THEME_ICON, THEME_LABEL, type Theme } from "../hooks/useTheme";
import type { RenderMode } from "../lib/config";

interface Props {
  theme: Theme;
  onCycleTheme: () => void;
  onOpenInfo: () => void;
  onOpenShortcuts: () => void;
  onOpenInstanceId: () => void;
  hasCustomInstanceId: boolean;
  onGithubClick: () => void;
  date1: string;
  date2: string;
  onDate1Change: (value: string) => void;
  onDate2Change: (value: string) => void;
  mode: RenderMode;
  onModeChange: (value: RenderMode) => void;
  isComparing: boolean;
  onCompare: () => void;
  onClose: () => void;
  onOpenSettings: () => void;
  settingsBtnRef: React.RefObject<HTMLButtonElement | null>;
  status: { message: string; isError: boolean };
  collapsed: boolean;
}

export function TopBar({
  theme,
  onCycleTheme,
  onOpenInfo,
  onOpenShortcuts,
  onOpenInstanceId,
  hasCustomInstanceId,
  onGithubClick,
  date1,
  date2,
  onDate1Change,
  onDate2Change,
  mode,
  onModeChange,
  isComparing,
  onCompare,
  onClose,
  onOpenSettings,
  settingsBtnRef,
  status,
  collapsed,
}: Props) {
  function applyQuickDate(days: number) {
    const base = date2 ? new Date(date2 + "T00:00:00Z") : new Date();
    base.setUTCDate(base.getUTCDate() - days);
    onDate1Change(base.toISOString().slice(0, 10));
  }

  return (
    <div id="panel" className={`topbar${collapsed ? " collapsed" : ""}`}>
      <div className="panel-header">
        <h1>Sentinel-2 Compare</h1>
        <div className="header-actions">
          <button id="info-btn" type="button" title="À propos" onClick={onOpenInfo}>
            ⓘ
          </button>
          <button id="shortcuts-btn" type="button" title="Raccourcis clavier" onClick={onOpenShortcuts}>
            ?
          </button>
          <button
            id="instance-id-btn"
            type="button"
            className={hasCustomInstanceId ? "has-custom-instance-id" : ""}
            title={hasCustomInstanceId ? "Identifiant CDSE personnel actif" : "Utiliser mon propre identifiant CDSE (quota)"}
            onClick={onOpenInstanceId}
          >
            🔑
          </button>
          <button id="github-btn" type="button" title="Code source (lien à venir)" onClick={onGithubClick}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </button>
          <button id="theme-toggle" type="button" title={`Thème : ${THEME_LABEL[theme]} — cliquer pour changer`} onClick={onCycleTheme}>
            {THEME_ICON[theme]}
          </button>
        </div>
      </div>

      <div className="topbar-dates row">
        <label>
          Avant
          <input type="date" id="date1" value={date1} max={date2 || undefined} onChange={(e) => onDate1Change(e.target.value)} />
        </label>
        <label>
          Après
          <input type="date" id="date2" value={date2} min={date1 || undefined} onChange={(e) => onDate2Change(e.target.value)} />
        </label>
      </div>
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

      <div className="topbar-mode row">
        <label className="topbar-mode-label">
          Rendu
          <select id="mode" value={mode} onChange={(e) => onModeChange(e.target.value as RenderMode)}>
            <option value="true-color">True Color</option>
            <option value="false-color">False Color</option>
            <option value="honc">Highlight Optimized Natural Color</option>
            <option value="fire">Wildfire (CDSE)</option>
          </select>
        </label>
        <button id="settings-btn" ref={settingsBtnRef} type="button" title="Réglages, export et partage" onClick={onOpenSettings}>
          ⚙
        </button>
      </div>

      <button id="compare-btn" onClick={onCompare}>
        Comparer
      </button>
      <button id="close-btn" className={isComparing ? "" : "hidden"} onClick={onClose}>
        Fermer la comparaison
      </button>

      <div
        id="status"
        className={`${status.message ? "status-box " : ""}${status.isError ? "status-warning" : status.message ? "status-info" : ""}`}
      >
        {status.message}
      </div>
    </div>
  );
}
