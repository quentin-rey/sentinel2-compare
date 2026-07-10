# Sentinel-2 Compare

App for comparing two Sentinel-2 satellite images at different dates over
the same area, with a georeferenced comparison slider (synchronized
pan/zoom). React + TypeScript + Vite, deployed as a static site on GitHub
Pages — no application backend.

## Architecture

- **UI**: React + TypeScript, built with [Vite](https://vite.dev/).
- **Map**: [MapLibre GL JS](https://maplibre.org/) (no key required),
  OpenStreetMap basemap for navigation.
- **Sentinel-2 imagery**: rendered server-side by the **WMTS** service of
  [Copernicus Data Space Ecosystem](https://dataspace.copernicus.eu/)
  (Sentinel Hub). The frontend calls this WMTS directly from the browser —
  no backend, deployable as-is on GitHub Pages.
- **Metadata** (actual acquisition date, cloud cover, missing-data
  detection): read-only requests to the
  [Copernicus Data Space Ecosystem OData catalogue](https://catalogue.dataspace.copernicus.eu/odata/v1/Products)
  — the same source that feeds the WMTS tiles, so it's always consistent
  with what's actually displayed.
- **Place search**: [Nominatim (OpenStreetMap)](https://nominatim.org/),
  free, no key.
- **Swipe**: two overlaid MapLibre instances, camera-synchronized, with a
  CSS `clip-path` driven by a draggable slider.

None of these services require a client-side secret — everything runs in
the browser.

### Code structure

```
src/
  lib/          pure functions / network calls (wmts, stacInfo, geocode,
                exportImage, animatedExport, swipe, config) — no
                React dependency
  hooks/        useBaseMap, useCompareMaps (the app's core: lifecycle of
                the two MapLibre maps + slider), useTheme,
                useMenuCollapsed, useToasts, useGeocodeSearch, useLanguage
  i18n/         FR/EN translation dictionary
  components/   Navbar, panel accordion sections, CompareView, modals
  utils/        small formatting helpers
tests/          Playwright suite (tests/e2e.spec.ts)
```

## Render modes

Defined as "Layers" in the Sentinel Hub configuration (see below):

| Mode in the app | Sentinel Hub Layer ID | Description |
|---|---|---|
| True Color | `TRUE-COLOR` | Natural colors (B04/B03/B02) |
| False Color | `FALSE-COLOR` | Vegetation in red (B08/B04/B03) |
| Highlight Optimized Natural Color | `TCO-L2A` | Contrast/gamma/saturation enhanced, highlights preserved |
| Wildfire | `WILDFIRE` | Custom QuickFire script highlighting fires/burn scars |

## Copernicus Data Space Ecosystem setup

Rendering Sentinel-2 imagery needs a one-time CDSE configuration (Instance
ID + 4 evalscript layers) — see **[SETUP.md](SETUP.md)** for the full
walkthrough, including how visitors can bring their own personal ID instead
of depending on the shared default quota.

## Running locally

```bash
npm install
npm run dev
```

Then open the printed URL (the path includes `/sentinel2-compare/`, see
`vite.config.ts`).

Other useful commands:

```bash
npm run build       # production build in dist/
npm run preview      # serve the production build locally
npm run lint         # oxlint
npm run test:e2e     # Playwright suite (see tests/e2e.spec.ts)
```

## Deployment (GitHub Pages)

Automated via `.github/workflows/deploy.yml`: every push to `main` builds
the app and deploys it to GitHub Pages via `actions/deploy-pages`.

One manual step required on GitHub: Settings → Pages → Source =
**GitHub Actions** (not "Deploy from a branch").

The base path (`base` in `vite.config.ts`) is set to match the repo name
(`/sentinel2-compare/`) — adjust it if the repo is renamed or if the app is
served at the root of a user/organization site.

## Features

- Georeferenced swipe comparison (synchronized pan/zoom between the two dates)
- Instant preview while the exact date resolves (explicit loading banner),
  so there's never an empty screen
- 4 render modes (True Color, False Color, HONC, Wildfire)
- "Closest date" selection priority (a preference, not an exclusion, on the
  cloud-cover threshold — so a smoky scene is never hidden) or
  "least cloudy"
- Manual per-side date picker when the area spans multiple Sentinel-2 tiles
  imaged on different days
- Place search (geocoding)
- Displays the actual date and cloud cover of the found scene
- Clear detection and message if no image is available for the chosen criteria
- Share via URL (place + dates + mode + settings)
- PNG/JPEG/GIF/WebM export with settings (size, quality, duration/smoothness
  for animations, filename), dated info bubbles burned into the export
- Light/dark/auto theme, collapsible panel, keyboard shortcuts, FR/EN
  language toggle
- Detection of exhausted imagery quota (several consecutive HTTP 429s from
  Sentinel Hub, to avoid confusing it with a transient rate limit), with an
  explicit message instead of silently blank tiles
- Dedicated "Personal CDSE ID" window (🔑 button, also opens automatically
  when the quota runs out) to use your own free quota instead of the shared
  default one (stored locally, never sent anywhere) — see [SETUP.md](SETUP.md)

## Known limitations

- **Shared quota**: the default Sentinel Hub Instance ID is visible in the
  source code and unprotected — abuse by a third party would consume the
  account's free quota. The app detects this case (several consecutive
  HTTP 429s) and invites the visitor to set a personal ID (see
  [SETUP.md](SETUP.md)) instead of leaving blank tiles with no explanation,
  but nothing yet prevents the abuse itself server-side (no domain
  restriction or proxy).
- **Nominatim**: rate-limited (~1 req/s), no key — fine for personal use
  but not for significant traffic.
- **Image export**: captures exactly what's shown on screen (at the
  resolution chosen in the export modal), not an independent
  high-resolution satellite image decoupled from the map's own rendering.
