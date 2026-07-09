// OpenStreetMap Nominatim — free, no API key, but rate-limited (~1 req/s).
// Callers should debounce input before calling this.
const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";

export interface PlaceResult {
  label: string;
  lat: number;
  lon: number;
  // [south, north, west, east] as numbers, or null if absent.
  boundingBox: number[] | null;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: string[];
}

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  if (!query || query.trim().length < 2) return [];

  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "5",
  });

  const res = await fetch(`${NOMINATIM_ENDPOINT}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Recherche de lieu échouée (HTTP ${res.status}).`);
  }

  const results: NominatimResult[] = await res.json();
  return results.map((r) => ({
    label: r.display_name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    boundingBox: r.boundingbox ? r.boundingbox.map(Number) : null,
  }));
}
