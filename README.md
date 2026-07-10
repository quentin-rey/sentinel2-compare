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
| Highlight Optimized Natural Color | `TCO-L2A` | Cube-root curve, highlights preserved |
| Wildfire | `WILDFIRE` | Custom QuickFire script highlighting fires/burn scars |

## Copernicus Data Space Ecosystem setup (one-time)

1. Create a free account on [dataspace.copernicus.eu](https://dataspace.copernicus.eu/).
2. Go to the [Configuration Utility](https://shapps.dataspace.copernicus.eu/dashboard/#/configurations).
3. **New Configuration** (based on a Sentinel-2 L2A template), give it a name.
4. Create the layers listed above (**New Layer** button), with the following evalscripts:

**`TRUE-COLOR`**
```js
//VERSION=3
function setup(){
  return{
    input: ["B02", "B03", "B04", "dataMask"],
    output: {bands: 4}
  }
}

function evaluatePixel(sample){
  // Set gain for visualisation
  let gain = 2.5;
  // Return RGB
  return [sample.B04 * gain, sample.B03 * gain, sample.B02 * gain, sample.dataMask];
}
```

**`FALSE-COLOR`**
```js
//VERSION=3
function setup(){
  return{
    input: ["B03", "B04", "B08", "dataMask"],
    output: {bands: 4}
  }
}

function evaluatePixel(sample){
  let gain = 2.5;
  return [sample.B08 * gain, sample.B04 * gain, sample.B03 * gain, sample.dataMask];
}
```

**`TCO-L2A`** (Highlight Optimized Natural Color)
```js
//VERSION=3
function setup() {
  return {
    input: ["B04", "B03", "B02", "dataMask"],
    output: { bands: 4 }
  };
}

// Contrast enhance / highlight compress

const maxR = 3.0; // max reflectance
const midR = 0.13;
const sat = 1.2;
const gamma = 1.8;

function evaluatePixel(smp) {
  const rgbLin = satEnh(sAdj(smp.B04), sAdj(smp.B03), sAdj(smp.B02));
  return [sRGB(rgbLin[0]), sRGB(rgbLin[1]), sRGB(rgbLin[2]), smp.dataMask];
}

function sAdj(a) {
  return adjGamma(adj(a, midR, 1, maxR));
}

const gOff = 0.01;
const gOffPow = Math.pow(gOff, gamma);
const gOffRange = Math.pow(1 + gOff, gamma) - gOffPow;

function adjGamma(b) {
  return (Math.pow((b + gOff), gamma) - gOffPow) / gOffRange;
}

// Saturation enhancement

function satEnh(r, g, b) {
  const avgS = (r + g + b) / 3.0 * (1 - sat);
  return [clip(avgS + r * sat), clip(avgS + g * sat), clip(avgS + b * sat)];
}

function clip(s) {
  return s < 0 ? 0 : s > 1 ? 1 : s;
}

//contrast enhancement with highlight compression

function adj(a, tx, ty, maxC) {
  var ar = clip(a / maxC, 0, 1);
  return ar * (ar * (tx / maxC + ty - 1) - ty) / (ar * (2 * tx / maxC - 1) - tx / maxC);
}

const sRGB = (c) => c <= 0.0031308 ? (12.92 * c) : (1.055 * Math.pow(c, 0.41666666666) - 0.055);
```

**`WILDFIRE`** (QuickFire v1.0.0 by [Pierre Markuse](https://twitter.com/Pierre_Markuse), CC BY 4.0)
```js
// VERSION=3
// QuickFire V1.0.0 by Pierre Markuse (https://twitter.com/Pierre_Markuse)
// Made for use in the Sentinel Hub EO Browser (https://apps.sentinel-hub.com/eo-browser/?)
// CC BY 4.0 International (https://creativecommons.org/licenses/by/4.0/)

function setup() {
  return {
    input: ["B01","B02","B03","B04","B08","B8A","B11","B12","CLP", "dataMask"],
    output: { bands: 4 }
  };
}

function stretch(val, min, max) {return (val - min) / (max - min);}

function satEnh(arr, s) {
   var avg = arr.reduce((a, b) => a + b, 0) / arr.length;
   return arr.map(a => avg * (1 - s) + a * s);
}

 function layerBlend(lay1, lay2, lay3, op1, op2, op3) {
    return lay1.map(function(num, index) {
     return (num / 100 * op1 + (lay2[index] / 100 * op2) + (lay3[index] / 100 * op3));
    });
  }

function evaluatePixel(sample) {
  const hsThreshold = [2.0, 1.5, 1.25, 1.0];
  const hotspot = 1;
  const style = 1;
  const hsSensitivity = 1.0;
  const boost = 1;

  const cloudAvoidance = 1;
  const cloudAvoidanceThreshold = 245;
  const avoidanceHelper = 0.8;

  const offset = -0.000;
  const saturation = 1.10;
  const brightness = 1.00;
  const sMin = 0.01;
  const sMax = 0.99;

  const showBurnscars = 0;
  const burnscarThreshold = -0.25;
  const burnscarStrength = 0.3;

  const NDWI = (sample.B03-sample.B08)/(sample.B03+sample.B08);
  const NDVI = (sample.B08-sample.B04)/(sample.B08+sample.B04);
  const waterHighlight = 0;
  const waterBoost = 2.0;
  const NDVI_threshold = -0.15;
  const NDWI_threshold = 0.15;
  const waterHelper = 0.2;

  const Black = [0, 0, 0];
  const NBRindex = (sample.B08-sample.B12) / (sample.B08+sample.B12);
  const naturalColorsCC = [Math.sqrt(brightness * sample.B04 + offset), Math.sqrt(brightness * sample.B03 + offset), Math.sqrt(brightness * sample.B02 + offset)];
  const naturalColors = [(2.5 * brightness * sample.B04 + offset), (2.5 * brightness * sample.B03 + offset), (2.5 * brightness * sample.B02 + offset)];
  const URBAN = [Math.sqrt(brightness * sample.B12 * 1.2 + offset), Math.sqrt(brightness * sample.B11 * 1.4 + offset), Math.sqrt(brightness * sample.B04 + offset)];
  const SWIR = [Math.sqrt(brightness * sample.B12 + offset), Math.sqrt(brightness * sample.B8A + offset), Math.sqrt(brightness * sample.B04 + offset)];
  const NIRblue = colorBlend(sample.B08, [0, 0.25, 1], [[0/255, 0/255, 0/255],[0/255, 100/255, 175/255],[150/255, 230/255, 255/255]]);
  const classicFalse = [sample.B08 * brightness, sample.B04 * brightness, sample.B03 * brightness];
  const NIR = [sample.B08 * brightness, sample.B08 * brightness, sample.B08 * brightness];
  const atmoPen = [sample.B12 * brightness, sample.B11 * brightness, sample.B08 * brightness];
  var enhNaturalColors = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) { enhNaturalColors[i] = (brightness * ((naturalColors[i] + naturalColorsCC[i]) / 2) + (URBAN[i] / 10)); }

  const manualCorrection = [0.00, 0.00, 0.00];

  var Viz = layerBlend(URBAN, naturalColors, naturalColorsCC, 10, 40, 50); // Choose visualization(s) and opacity here

  if (waterHighlight) {
    if ((NDVI < NDVI_threshold) && (NDWI > NDWI_threshold) && (sample.B04 < waterHelper)) {
     Viz[1] = Viz[1] * 1.2 * waterBoost + 0.1;
     Viz[2] = Viz[2] * 1.5 * waterBoost + 0.2;
    }
  }

  Viz = satEnh(Viz, saturation);
  for (let i = 0; i < 3; i += 1) {
    Viz[i] = stretch(Viz[i], sMin, sMax);
    Viz[i] += manualCorrection[i];
  }

  if (hotspot) {
    if ((!cloudAvoidance) || ((sample.CLP<cloudAvoidanceThreshold) && (sample.B02<avoidanceHelper))) {
     switch (style) {
       case 1:
        if ((sample.B12 + sample.B11) > (hsThreshold[0] / hsSensitivity)) return [((boost * 0.50 * sample.B12)+Viz[0]), ((boost * 0.50 * sample.B11)+Viz[1]), Viz[2], sample.dataMask];
        if ((sample.B12 + sample.B11) > (hsThreshold[1] / hsSensitivity)) return [((boost * 0.50 * sample.B12)+Viz[0]), ((boost * 0.20 * sample.B11)+Viz[1]), Viz[2], sample.dataMask];
        if ((sample.B12 + sample.B11) > (hsThreshold[2] / hsSensitivity)) return [((boost * 0.50 * sample.B12)+Viz[0]), ((boost * 0.10 * sample.B11)+Viz[1]), Viz[2], sample.dataMask];
        if ((sample.B12 + sample.B11) > (hsThreshold[3] / hsSensitivity)) return [((boost * 0.50 * sample.B12)+Viz[0]), ((boost * 0.00 * sample.B11)+Viz[1]), Viz[2], sample.dataMask];
       break;
       case 2:
        if ((sample.B12 + sample.B11) > (hsThreshold[3] / hsSensitivity)) return [1, 0, 0, sample.dataMask];
       break;
       case 3:
        if ((sample.B12 + sample.B11) > (hsThreshold[3] / hsSensitivity)) return [1, 1, 0, sample.dataMask];
       break;
       case 4:
        if ((sample.B12 + sample.B11) > (hsThreshold[3] / hsSensitivity)) return [Viz[0] + 0.2, Viz[1] - 0.2, Viz[2] - 0.2, sample.dataMask];
       break;
       default:
      }
    }
  }

  if (showBurnscars) {
   if (NBRindex<burnscarThreshold) {
     Viz[0] = Viz[0] + burnscarStrength;
     Viz[1] = Viz[1] + burnscarStrength;
   }
  }

  return [Viz[0], Viz[1], Viz[2], sample.dataMask];
}
```

5. Get the **Instance ID** shown in the configuration's panel.
6. Paste it into [`src/lib/config.ts`](src/lib/config.ts) (`SH_INSTANCE_ID`),
   and check that `MODE_LAYERS` points to the right Layer IDs if you named
   them differently.

⚠️ **Note on Instance ID:** The Instance ID is embedded in the frontend
client-side code by design. To prevent third-party usage from impacting the
default shared instance limits, visitors can configure their own personal
CDSE credentials directly within the application using the 🔑 button (see
the *Personal CDSE ID (Bring Your Own ID)* section below).

## Personal CDSE ID (Bring Your Own ID)

All visitors of the app share the same Instance ID by default (and
therefore the same free Sentinel Hub quota). If that shared quota runs out
— the app detects it (HTTP 429) and shows an explicit message instead of
blank tiles — or if you just want to never depend on it, you can set your
own Instance ID:

1. Click the 🔑 button in the app's navbar (or let it open automatically
   when the shared quota is detected as exhausted).
2. Follow the instructions shown in the window: create a free CDSE
   account, create a configuration, create the **same 4 layers listed
   above** in it (`TRUE-COLOR`, `FALSE-COLOR`, `TCO-L2A`, `WILDFIRE`, with
   the same evalscripts) — without these layers under the same names, the
   tiles would stay blank.
3. Paste that configuration's Instance ID into the field. It's stored only
   in `localStorage`, on that device — never sent anywhere other than
   directly to Sentinel Hub, exactly like the default shared Instance ID.

The 🔑 button turns blue/active once a personal ID is set; a "Revert to
shared quota" button in the same window clears it.

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
  default one (stored locally, never sent anywhere) — see the dedicated
  section above

## Known limitations

- **Shared quota**: the default Sentinel Hub Instance ID is visible in the
  source code and unprotected — abuse by a third party would consume the
  account's free quota. The app detects this case (several consecutive
  HTTP 429s) and invites the visitor to set a personal ID (see "Personal
  CDSE ID" above) instead of leaving blank tiles with no explanation, but
  nothing yet prevents the abuse itself server-side (no domain restriction
  or proxy).
- **Nominatim**: rate-limited (~1 req/s), no key — fine for personal use
  but not for significant traffic.
- **Image export**: captures exactly what's shown on screen (at the
  resolution chosen in the export modal), not an independent
  high-resolution satellite image decoupled from the map's own rendering.
