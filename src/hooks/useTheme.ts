import { useEffect } from "react";
import { useLocalStorageState } from "./useLocalStorageState";

export type Theme = "auto" | "light" | "dark";

const THEME_KEY = "s2compare-theme";

// U+FE0E forces monochrome "text" glyph rendering instead of a colorful
// emoji, matching the other monochrome icon buttons (ⓘ, ?, GitHub).
export const THEME_ICON: Record<Theme, string> = {
  auto: "◐︎",
  light: "☀︎",
  dark: "☾︎",
};

export function useTheme() {
  const [theme, setTheme] = useLocalStorageState(THEME_KEY, "auto");

  useEffect(() => {
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, [theme]);

  return { theme: theme as Theme, setTheme: (next: Theme) => setTheme(next) };
}
