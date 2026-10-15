import { useEffect, useState, type ReactNode } from "react";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { LanguageContext } from "../hooks/useLanguage";
import { translations, type Lang, type Translations } from "../i18n/translations";

const LANG_KEY = "s2compare-lang";

// The app has been French-first throughout this project, so an
// undetectable/non-browser environment falls back to "fr" rather than "en" —
// this only changes the *default* for first-time visitors; browsers
// reporting a non-French language get English.
function detectDefaultLang(): Lang {
  if (typeof navigator === "undefined" || !navigator.language) return "fr";
  return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

// `?lang=en|fr` wins over the stored/detected language: it's what the
// English hreflang URL in index.html/sitemap.xml points at, so a visitor (or
// crawler) arriving from it must get that language regardless of history.
// Read once at module load (the app's URL sync later rewrites the query
// string without it), and persisted before the first render reads storage.
const LANG_FROM_URL: Lang | null = (() => {
  if (typeof location === "undefined") return null;
  const value = new URLSearchParams(location.search).get("lang");
  if (value !== "en" && value !== "fr") return null;
  try {
    localStorage.setItem(LANG_KEY, value);
  } catch {
    // Storage blocked: LANG_FROM_URL still wins below.
  }
  return value;
})();

// Each language URL (?lang=fr / ?lang=en) is its own canonical, matching the
// hreflang alternates in index.html; the bare URL (x-default, auto-detected
// language) keeps index.html's static canonical.
function setCanonicalForUrlLang(lang: Lang): void {
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", `${location.origin}${location.pathname}?lang=${lang}`);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useLocalStorageState(LANG_KEY, detectDefaultLang());
  const lang = (stored === "en" ? "en" : "fr") as Lang;
  // Only for this first visit's URL: once the user toggles, `stored` rules.
  const [urlLangPending, setUrlLangPending] = useState(LANG_FROM_URL !== null);
  const effectiveLang: Lang = urlLangPending && LANG_FROM_URL ? LANG_FROM_URL : lang;

  useEffect(() => {
    document.documentElement.lang = effectiveLang;
    document.title = translations[effectiveLang].metaTitle;
    document.querySelector('meta[name="description"]')?.setAttribute("content", translations[effectiveLang].metaDescription);
  }, [effectiveLang]);

  useEffect(() => {
    if (LANG_FROM_URL) setCanonicalForUrlLang(LANG_FROM_URL);
  }, []);

  function setLang(next: Lang) {
    setUrlLangPending(false);
    setStored(next);
  }

  function t<K extends keyof Translations>(key: K, ...args: Translations[K] extends (p: infer P) => string ? [P] : []): string {
    const entry = translations[effectiveLang][key];
    return typeof entry === "function" ? (entry as (p: unknown) => string)(args[0]) : (entry as string);
  }

  return <LanguageContext.Provider value={{ lang: effectiveLang, setLang, t }}>{children}</LanguageContext.Provider>;
}
