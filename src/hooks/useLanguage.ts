import { createContext, useContext } from "react";
import type { Lang, Translations } from "../i18n/translations";

export type TFunction = <K extends keyof Translations>(key: K, ...args: Translations[K] extends (p: infer P) => string ? [P] : []) => string;

export interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TFunction;
}

// Provided by components/LanguageProvider.tsx (kept in its own file so this
// module exports no component, which React Fast Refresh requires).
export const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useTranslation(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useTranslation() must be used within a LanguageProvider");
  return ctx;
}
