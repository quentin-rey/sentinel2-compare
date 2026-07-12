import { useEffect } from "react";
import { useLocalStorageState } from "./useLocalStorageState";

export type Theme = "auto" | "light" | "dark";

const THEME_KEY = "s2compare-theme";

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
