import { useEffect, useRef } from "react";
import type { PlaceResult } from "../lib/geocode";

interface Props {
  query: string;
  onQueryChange: (value: string) => void;
  results: PlaceResult[];
  onSelect: (result: PlaceResult) => void;
  onDismiss: () => void;
}

export function PlaceSearchSection({ query, onQueryChange, results, onSelect, onDismiss }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    function handleDocumentClick(e: MouseEvent) {
      const target = e.target as Node;
      if (!listRef.current?.contains(target) && target !== inputRef.current) {
        onDismiss();
      }
    }
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, [onDismiss]);

  return (
    <>
      <label>
        Rechercher un lieu
        <input
          ref={inputRef}
          type="text"
          id="place-search"
          placeholder="Ville, adresse, lieu..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </label>
      <ul id="place-results" ref={listRef} className={results.length ? "" : "hidden"}>
        {results.map((r, i) => (
          <li
            key={i}
            onClick={() => {
              onSelect(r);
              onQueryChange(r.label);
            }}
          >
            {r.label}
          </li>
        ))}
      </ul>
    </>
  );
}
