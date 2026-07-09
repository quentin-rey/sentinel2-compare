export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function slug(value: string): string {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Strips the "Avant — "/"Après — " prefix from a rendered label, leaving
// just the date/cloud portion (used when exporting a single side alone,
// where the prefix would be redundant).
export function stripLabelPrefix(text: string): string {
  const idx = text.indexOf("—");
  return idx === -1 ? text : text.slice(idx + 1).trim();
}

// Keeps only the date portion of a "date · cloud%" label value — exports
// deliberately leave cloud cover out (a search-tuning detail, not something
// worth burning permanently into a shared image).
export function dateOnly(value: string): string {
  const idx = value.indexOf("·");
  return (idx === -1 ? value : value.slice(0, idx)).trim();
}
