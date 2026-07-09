import { useEffect, useState } from "react";

export function useLocalStorageState(key: string, defaultValue: string) {
  const [value, setValue] = useState<string>(() => localStorage.getItem(key) ?? defaultValue);

  useEffect(() => {
    localStorage.setItem(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}
