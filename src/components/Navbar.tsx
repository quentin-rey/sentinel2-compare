import { type Theme } from "../hooks/useTheme";
import { useTranslation } from "../hooks/useLanguage";
import type { Lang } from "../i18n/translations";

const GITHUB_REPO_URL = "https://github.com/quentin-rey/sentinel2-compare";

interface Props {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onOpenInfo: () => void;
  onOpenShortcuts: () => void;
  onOpenInstanceId: () => void;
  hasCustomInstanceId: boolean;
}

const THEME_ORDER: Theme[] = ["dark", "light", "auto"];

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === "dark") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }
  if (theme === "light") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

export function Navbar({ theme, onThemeChange, onOpenInfo, onOpenShortcuts, onOpenInstanceId, hasCustomInstanceId }: Props) {
  const { lang, setLang, t } = useTranslation();
  const themeLabelFor = (th: Theme) => (th === "auto" ? t("themeLabelAuto") : th === "light" ? t("themeLabelLight") : t("themeLabelDark"));

  return (
    <nav id="navbar">
      <h1>Sentinel-2 Compare</h1>
      <div className="navbar-actions">
        <div className="segment-toggle lang-toggle" role="group" aria-label="FR / EN">
          <span
            className="segment-toggle-indicator"
            aria-hidden="true"
            style={{ transform: `translateX(calc(100% * ${lang === "en" ? 1 : 0}))` }}
          />
          {(["fr", "en"] as Lang[]).map((l) => (
            <button
              key={l}
              type="button"
              className={l === lang ? "active" : ""}
              onClick={() => setLang(l)}
              aria-pressed={l === lang}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <button id="info-btn" type="button" title={t("navAbout")} onClick={onOpenInfo}>
          ⓘ
        </button>
        <button id="shortcuts-btn" type="button" title={t("navShortcuts")} onClick={onOpenShortcuts}>
          ?
        </button>
        <button
          id="instance-id-btn"
          type="button"
          className={hasCustomInstanceId ? "has-custom-instance-id" : ""}
          title={hasCustomInstanceId ? t("navInstanceIdActive") : t("navInstanceIdInactive")}
          onClick={onOpenInstanceId}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
          </svg>
        </button>
        <a id="github-btn" href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" title={t("navGithub")}>
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </a>
        <div className="segment-toggle theme-toggle" role="group" aria-label="Theme">
          <span
            className="segment-toggle-indicator"
            aria-hidden="true"
            style={{ transform: `translateX(calc(100% * ${THEME_ORDER.indexOf(theme)}))` }}
          />
          {THEME_ORDER.map((th) => (
            <button
              key={th}
              type="button"
              className={th === theme ? "active" : ""}
              title={t("navThemeTooltip", { themeLabel: themeLabelFor(th) })}
              onClick={() => onThemeChange(th)}
              aria-pressed={th === theme}
            >
              <ThemeIcon theme={th} />
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
