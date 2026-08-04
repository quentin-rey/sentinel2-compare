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
- **Villes/départements overlays**: commune (town hall coordinates —
  `geometry=mairie`, not the administrative polygon centroid) and
  département boundaries from
  [geo.api.gouv.fr](https://geo.api.gouv.fr/) and a
  [community-maintained départements GeoJSON](https://github.com/gregoiredavid/france-geojson),
  both free and keyless (`lib/adminLayers.ts`).
- **Swipe**: two overlaid MapLibre instances, camera-synchronized, with a
  CSS `clip-path` driven by a draggable slider.

None of these services require a client-side secret — everything runs in
the browser.

### Code structure

```
src/
  lib/          pure functions / network calls (earthSearch, cogRaster,
                cogProtocol, renderModes, geocode, adminLayers, exportImage,
                exportHighRes, animatedExport, swipe, config) — no React
                dependency
  workers/      cogTile.worker.ts — off-main-thread COG decode/render
  hooks/        useBaseMap, useCompareMaps (the app's core: lifecycle of
                the two MapLibre maps + slider), useTheme,
                useMenuCollapsed, useToasts, useGeocodeSearch, useLanguage,
                useLocalStorageState, useDisablePinchZoom
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
| Wildfire | B02/B03/B04/B11/B12/SCL | SWIR hotspot detection highlighting fires/burn scars |
| SWIR (B11/B8A/B5) | B11/B8A/B5 | SWIR1/NIR-narrow/red-edge composite (issue #44) — all three bands natively 20m, unlike the classic B11/B8/B4 SWIR script |

These are ports of evalscripts originally written for Sentinel Hub's server
-side renderer, kept as reference/attribution in
[`docs/evalscripts/`](docs/evalscripts/) — including
[`wildfire.js`](docs/evalscripts/wildfire.js) (QuickFire v1.0.0 by
[Pierre Markuse](https://twitter.com/Pierre_Markuse), CC BY 4.0). The
wildfire port's cloud-avoidance term originally used a cloud-probability
band (`CLP`) that isn't a standard Earth Search/AWS asset — approximated
here instead with the Scene Classification Layer (`SCL`, a standard Earth
Search asset), whose cloud/cirrus classes suppress the SWIR hotspot
highlight the same way the original's `CLP` threshold did.

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

## Features

- Georeferenced swipe comparison (synchronized pan/zoom between the two dates)
- 5 render modes (True Color, False Color, HONC, Wildfire, SWIR), rendered
  entirely client-side — no account or quota involved
- "Closest date" selection priority (a preference, not an exclusion, on the
  cloud-cover threshold — so a smoky scene is never hidden) or
  "least cloudy"
- Manual per-side date picker when the area spans multiple Sentinel-2 tiles
  imaged on different days
- Place search (geocoding)
- Displays the actual date and cloud cover of the found scene
- Clear detection and message if no image is available for the chosen criteria
- Share via URL (place + dates + mode + settings), kept in sync with a
  manually picked date from a label's dropdown, not just the sidebar's dates
- Optional overlays: town names (positioned at the town hall, not the
  administrative centroid) and département boundaries, both togglable with
  their own styling (population floor, text color/halo/size, line opacity)
- Distance scale: a live on-map control, and burned into every export at
  the correct scale for that export's own resolution
- PNG/JPEG/GIF/WebM export with settings (size, quality, duration/smoothness
  and end-of-loop pause for animations, filename), dated info bubbles and a
  watermark burned into the export. GIF/WebM offer two sweep styles (slide
  or opacity crossfade). PNG/JPEG can optionally render fresh from the
  satellite data at a resolution decoupled from the screen
  (`lib/exportHighRes.ts`) instead of capturing the on-screen canvas — see
  the note in Known limitations.
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
  area. Mitigated but not eliminated: each compare side gets its own Worker
  pool lane (so the second image never queues behind the first's tiles),
  already-opened bands/read windows are cached for the rest of the session,
  and the loading indicator now honestly tracks real render completion
  instead of disappearing early. No fix planned beyond that for now —
  progressive (coarse-then-refined) rendering would help further but is a
  bigger change.
- **Nominatim**: rate-limited (~1 req/s), no key — fine for personal use
  but not for significant traffic.
- **High-resolution export**: PNG/JPEG can render directly from the
  satellite data at a fixed 3840px-wide target instead of capturing the
  on-screen canvas, but only for a north-up, unpitched view (it samples an
  axis-aligned grid, which can't reproduce a rotated/tilted camera the way
  reading back the actual WebGL framebuffer can), and only when the
  villes/départements overlays are off (that direct-COG render never draws
  MapLibre's own vector layers) — falls back to the normal capture export
  automatically in either case, or if the exact scene can't be resolved.
  Not available for animated GIF/WebM export, which stay on the
  screen-capture path.
