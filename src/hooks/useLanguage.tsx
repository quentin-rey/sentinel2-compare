import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useLocalStorageState } from "./useLocalStorageState";
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

export type TFunction = <K extends keyof Translations>(key: K, ...args: Translations[K] extends (p: infer P) => string ? [P] : []) => string;

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TFunction;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useLocalStorageState(LANG_KEY, detectDefaultLang());
  const lang = (stored === "en" ? "en" : "fr") as Lang;

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  function setLang(next: Lang) {
    setStored(next);
  }

  function t<K extends keyof Translations>(key: K, ...args: Translations[K] extends (p: infer P) => string ? [P] : []): string {
    const entry = translations[lang][key];
    return typeof entry === "function" ? (entry as (p: unknown) => string)(args[0]) : (entry as string);
  }

  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>;
}

export function useTranslation(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useTranslation() must be used within a LanguageProvider");
  return ctx;
}
