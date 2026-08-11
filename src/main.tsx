import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "./styles/style.css";
import App from "./App.tsx";
import { LanguageProvider } from "./hooks/useLanguage";
import { registerCogProtocol } from "./lib/cogProtocol";

// maplibre-gl 6's own worker (GeoJSON tiling, among other background work)
// needs its URL pointed out explicitly under Vite — import.meta.url-based
// auto-detection doesn't survive bundling. Without this, GeoJSON sources
// (lib/adminLayers.ts's départements/villes overlays) add their data and
// layers with no error at all, but nothing ever actually renders: the
// worker that tiles that data for painting never loads. `?worker&url`
// (not plain `?url`) routes the file through Vite's worker pipeline, which
// bundles its sibling maplibre-gl-shared.mjs import into one self-contained
// chunk — a plain `?url` emits the worker file as-is, missing that sibling
// in production builds, so it fails on its own first import.
setWorkerUrl(workerUrl);

registerCogProtocol();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
);
