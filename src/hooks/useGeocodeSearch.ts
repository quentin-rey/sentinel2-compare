import { useEffect, useRef, useState } from "react";
import { searchPlaces, type PlaceResult } from "../lib/geocode";

export function useGeocodeSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(timeoutRef.current);
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    timeoutRef.current = window.setTimeout(async () => {
      try {
        setResults(await searchPlaces(query));
      } catch (err) {
        console.warn("Recherche de lieu indisponible:", err);
      }
    }, 450);
    return () => window.clearTimeout(timeoutRef.current);
  }, [query]);

  function clear() {
    setResults([]);
  }

  return { query, setQuery, results, clear };
}
