import { useLocalStorageState } from "./useLocalStorageState";

const MENU_KEY = "s2compare-menu-collapsed";

export function useMenuCollapsed() {
  const [stored, setStored] = useLocalStorageState(MENU_KEY, "0");
  const collapsed = stored === "1";

  function toggleMenu() {
    setStored(collapsed ? "0" : "1");
  }

  return { collapsed, toggleMenu };
}
