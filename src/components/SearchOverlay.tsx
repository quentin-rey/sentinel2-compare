import { useEffect, useRef, useState } from "react";
import type { PlaceResult } from "../lib/geocode";

interface Props {
  query: string;
  onQueryChange: (value: string) => void;
  results: PlaceResult[];
  onSelect: (result: PlaceResult) => void;
  onDismiss: () => void;
}

// Floating map control: collapsed to a single icon by default, expands in
// place into a search input + results dropdown. Kept self-contained (owns
// its own open/closed state and handles its own Escape/outside-click) rather
// than lifted into App's modal/sheet state — it's a lightweight map overlay,
// not a full-screen dialog.
export function SearchOverlay({ query, onQueryChange, results, onSelect, onDismiss }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Safe to attach synchronously (unlike SettingsSheet's equivalent
    // listener): the toggle button lives inside wrapRef, so the `contains`
    // check below already excludes it — no risk of the opening click
    // immediately closing the overlay again.
    function handleDocumentClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setOpen(false);
    onDismiss();
  }

  return (
    <div id="search-overlay" ref={wrapRef} className={open ? "open" : ""}>
      <button id="search-toggle-btn" type="button" title="Rechercher un lieu" onClick={() => setOpen((o) => !o)}>
        🔍
      </button>
      {open && (
        <div id="search-panel">
          <input
            ref={inputRef}
            type="text"
            id="place-search"
            placeholder="Ville, adresse, lieu..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              // Stops here (rather than bubbling to the app-wide Escape
              // priority chain) so opening the search overlay never
              // accidentally closes the compare view instead of itself.
              if (e.key === "Escape") {
                e.stopPropagation();
                close();
              }
            }}
          />
          <ul id="place-results" className={results.length ? "" : "hidden"}>
            {results.map((r, i) => (
              <li
                key={i}
                onClick={() => {
                  onSelect(r);
                  onQueryChange(r.label);
                  setOpen(false);
                }}
              >
                {r.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
