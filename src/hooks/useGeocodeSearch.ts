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
    // Set by the cleanup below once the query has moved on: a slow
    // response for an older query must not overwrite a newer one's results.
    let stale = false;
    timeoutRef.current = window.setTimeout(async () => {
      try {
        const found = await searchPlaces(query);
        if (!stale) setResults(found);
      } catch (err) {
        console.warn("Recherche de lieu indisponible:", err);
      }
    }, 450);
    return () => {
      stale = true;
      window.clearTimeout(timeoutRef.current);
    };
  }, [query]);

  function clear() {
    setResults([]);
  }

  return { query, setQuery, results, clear };
}
