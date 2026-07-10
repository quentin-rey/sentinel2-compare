# Sentinel-2 Compare

App for comparing two Sentinel-2 satellite images at different dates over
the same area, with a georeferenced comparison slider (synchronized
pan/zoom). React + TypeScript + Vite, deployed as a static site on GitHub
Pages — no application backend.

## Architecture

- **UI**: React + TypeScript, built with [Vite](https://vite.dev/).
- **Map**: [MapLibre GL JS](https://maplibre.org/) (no key required),
  OpenStreetMap basemap for navigation.
- **Sentinel-2 imagery**: rendered entirely in the browser from
  [AWS Earth Search](https://element84.com/earth-search/) (Element84) —
  a free, no-auth STAC API over the public `sentinel-cogs` S3 bucket.
  There's no server-side tile renderer to call: the app reads the relevant
  window of each band's Cloud-Optimized GeoTIFF directly (HTTP range
  requests), reprojects it from the scene's UTM zone into the requested Web
  Mercator tile, and applies the render mode's band math — all in a pool of
  Web Workers (`lib/cogRaster.ts`, `workers/cogTile.worker.ts`), registered
  with MapLibre as a custom tile protocol (`lib/cogProtocol.ts`). No account,
  no quota, no Instance ID to configure — same zero-backend deployment as
  everything else here, just with the rendering moved into the client.
- **Metadata** (actual acquisition date, cloud cover, missing-data
  detection): read-only requests to the same Earth Search STAC API
  (`lib/earthSearch.ts`).
- **Place search**: [Nominatim (OpenStreetMap)](https://nominatim.org/),
  free, no key.
- **Swipe**: two overlaid MapLibre instances, camera-synchronized, with a
  CSS `clip-path` driven by a draggable slider.

None of these services require a client-side secret — everything runs in
the browser.

### Code structure

```
src/
  lib/          pure functions / network calls (earthSearch, cogRaster,
                cogProtocol, renderModes, geocode, exportImage,
                animatedExport, swipe, config) — no React dependency
  workers/      cogTile.worker.ts — off-main-thread COG decode/render
  hooks/        useBaseMap, useCompareMaps (the app's core: lifecycle of
                the two MapLibre maps + slider), useTheme,
                useMenuCollapsed, useToasts, useGeocodeSearch, useLanguage
  i18n/         FR/EN translation dictionary
  components/   Navbar, panel accordion sections, CompareView, modals
  utils/        small formatting helpers
tests/          Playwright suite (tests/e2e.spec.ts)
```

## Render modes

Each mode is a small band-math function in `lib/renderModes.ts`, applied
per-pixel to the decoded COG bands:

| Mode in the app | Bands used | Description |
|---|---|---|
| True Color | B04/B03/B02 | Natural colors |
| False Color | B08/B04/B03 | Vegetation in red |
| Highlight Optimized Natural Color | B04/B03/B02 | Contrast/gamma/saturation enhanced, highlights preserved |
| Wildfire | B02/B03/B04/B11/B12 | SWIR hotspot detection highlighting fires/burn scars |

These are ports of evalscripts originally written for Sentinel Hub's server
-side renderer, kept as reference/attribution in
[`docs/evalscripts/`](docs/evalscripts/) — including
[`wildfire.js`](docs/evalscripts/wildfire.js) (QuickFire v1.0.0 by
[Pierre Markuse](https://twitter.com/Pierre_Markuse), CC BY 4.0). The
wildfire port drops that script's cloud-avoidance refinement, since it
relies on a cloud-probability band (`CLP`) that isn't a standard Earth
Search/AWS asset — the core SWIR hotspot detection is unaffected.

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
- 4 render modes (True Color, False Color, HONC, Wildfire), rendered
  entirely client-side — no account or quota involved
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

## Known limitations

- **Very recent acquisitions**: Earth Search's AWS mirror can lag the
  official Copernicus archive by hours to days for the most recent
  Sentinel-2 passes — accepted in exchange for having no imagery quota at
  all (the app used to query CDSE's own catalogue instead, precisely to
  avoid this lag, before that catalogue's WMTS quota became the bigger
  problem).
- **First-load rendering time**: the first tiles for a newly-picked scene
  involve live COG range-reads and reprojection math in a Worker — slower
  than a pre-rendered PNG tile service, especially the first pan into a new
  area. Already-opened bands/read windows are cached for the rest of the
  session.
- **Wildfire mode**: the cloud-avoidance refinement from the original
  QuickFire script is not reproduced (see above) — an approximation, not a
  loss of the core hotspot detection.
- **Nominatim**: rate-limited (~1 req/s), no key — fine for personal use
  but not for significant traffic.
- **Image export**: captures exactly what's shown on screen (at the
  resolution chosen in the export modal), not an independent
  high-resolution satellite image decoupled from the map's own rendering.
