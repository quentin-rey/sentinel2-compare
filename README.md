# Sentinel-2 Compare

App pour comparer deux images satellite Sentinel-2 à des dates différentes,
sur la même zone, avec un slider de comparaison géoréférencé (pan/zoom
synchronisés). React + TypeScript + Vite, déployée en site statique sur
GitHub Pages — aucun backend applicatif.

## Architecture

- **UI** : React + TypeScript, buildée avec [Vite](https://vite.dev/).
- **Carte** : [MapLibre GL JS](https://maplibre.org/) (aucune clé requise),
  fond de carte OpenStreetMap pour la navigation.
- **Imagerie Sentinel-2** : rendue côté serveur par le service **WMTS** de
  [Copernicus Data Space Ecosystem](https://dataspace.copernicus.eu/)
  (Sentinel Hub). Le frontend appelle directement ce WMTS depuis le
  navigateur — pas de backend, déployable tel quel sur GitHub Pages.
- **Métadonnées** (date réelle de l'acquisition, taux de nuages, détection
  d'absence de données) : requêtes en lecture seule vers le
  [catalogue OData de Copernicus Data Space Ecosystem](https://catalogue.dataspace.copernicus.eu/odata/v1/Products)
  — la même source que celle qui alimente les tuiles WMTS, donc toujours
  cohérente avec ce qui est réellement affiché.
- **Recherche de lieu** : [Nominatim (OpenStreetMap)](https://nominatim.org/),
  gratuit, sans clé.
- **Swipe** : deux instances MapLibre superposées, synchronisées en caméra,
  avec un `clip-path` CSS piloté par un slider glissable.

Aucun de ces services ne nécessite de secret côté client — tout tourne dans
le navigateur.

### Structure du code

```
src/
  lib/          fonctions pures / appels réseau (wmts, stacInfo, geocode,
                exportImage, animatedExport, swipe, config) — aucune
                dépendance à React
  hooks/        useBaseMap, useCompareMaps (cœur de l'app : cycle de vie
                des deux cartes MapLibre + slider), useTheme,
                useMenuCollapsed, useToasts, useGeocodeSearch
  components/   Panel, sections du formulaire, CompareView, modales
  utils/        petits helpers de formatage
tests/          suite Playwright (tests/e2e.spec.ts)
```

## Modes de rendu

Définis comme "Layers" dans la configuration Sentinel Hub (voir plus bas) :

| Mode dans l'app | Layer ID Sentinel Hub | Description |
|---|---|---|
| True Color | `TRUE-COLOR` | Couleurs naturelles (B04/B03/B02) |
| False Color | `FALSE-COLOR` | Végétation en rouge (B08/B04/B03) |
| Highlight Optimized Natural Color | `TCO-L2A` | Courbe en racine cubique, hautes lumières préservées |
| Wildfire | `WILDFIRE` | Template intégré Copernicus pour les feux/zones brûlées |

## Configuration Copernicus Data Space Ecosystem (à faire une fois)

1. Créer un compte gratuit sur [dataspace.copernicus.eu](https://dataspace.copernicus.eu/).
2. Aller sur le [Configuration Utility](https://shapps.dataspace.copernicus.eu/dashboard/#/configurations).
3. **New Configuration** (basée sur un template Sentinel-2 L2A), lui donner un nom.
4. Créer les layers listés ci-dessus (bouton **New Layer**), avec les evalscripts suivants :

**`TRUE-COLOR`**
```js
//VERSION=3
function setup() {
  return { input: [{ bands: ["B04", "B03", "B02", "dataMask"] }], output: { bands: 4 } };
}
function evaluatePixel(sample) {
  return [2.5 * sample.B04, 2.5 * sample.B03, 2.5 * sample.B02, sample.dataMask];
}
```

**`FALSE-COLOR`**
```js
//VERSION=3
function setup() {
  return { input: [{ bands: ["B08", "B04", "B03", "dataMask"] }], output: { bands: 4 } };
}
function evaluatePixel(sample) {
  return [2.5 * sample.B08, 2.5 * sample.B04, 2.5 * sample.B03, sample.dataMask];
}
```

**`TCO-L2A`** (Highlight Optimized Natural Color, script officiel Sentinel Hub par Marko Repše)
```js
//VERSION=3
function setup() {
  return { input: [{ bands: ["B04", "B03", "B02", "dataMask"] }], output: { bands: 4 } };
}
function evaluatePixel(sample) {
  return [
    Math.cbrt(0.6 * sample.B04),
    Math.cbrt(0.6 * sample.B03),
    Math.cbrt(0.6 * sample.B02),
    sample.dataMask
  ];
}
```

**`WILDFIRE`** : layer de template intégré (pas de script à coller).

5. Récupérer l'**Instance ID** affiché dans le panneau de la configuration.
6. Le coller dans [`src/lib/config.ts`](src/lib/config.ts) (`SH_INSTANCE_ID`), et
   vérifier que `MODE_LAYERS` pointe vers les bons Layer IDs si tu les as
   nommés différemment.

⚠️ L'Instance ID est **public par nature** (il est embarqué dans le code
frontend) — ce n'est pas un secret, mais **n'importe qui peut l'utiliser et
consommer ton quota gratuit** s'il le récupère depuis le code source. Pas de
restriction de domaine mise en place pour l'instant (voir "Limites connues").
Chaque visiteur peut cependant renseigner son propre Instance ID dans les
réglages avancés de l'app pour ne pas dépendre du quota partagé (voir
"Fonctionnalités").

## Lancer en local

```bash
npm install
npm run dev
```

Puis ouvrir l'URL affichée (le chemin inclut `/sentinel2-compare/`, voir
`vite.config.ts`).

Autres commandes utiles :

```bash
npm run build       # build de production dans dist/
npm run preview      # sert le build de production en local
npm run lint         # oxlint
npm run test:e2e     # suite Playwright (voir tests/e2e.spec.ts)
```

## Déploiement (GitHub Pages)

Automatisé via `.github/workflows/deploy.yml` : chaque push sur `main`
build l'app et la déploie sur GitHub Pages via `actions/deploy-pages`.

Étape unique à faire manuellement sur GitHub : Settings → Pages → Source =
**GitHub Actions** (pas "Deploy from a branch").

Le chemin de base (`base` dans `vite.config.ts`) est calé sur le nom du
dépôt (`/sentinel2-compare/`) — à adapter si le dépôt est renommé ou si
l'app est servie à la racine d'un site utilisateur/organisation.

## Fonctionnalités

- Comparaison swipe géoréférencée (pan/zoom synchronisés entre les deux dates)
- Aperçu instantané pendant la résolution de la date exacte (bandeau de
  chargement explicite), pour ne jamais laisser un écran vide
- 4 modes de rendu (True Color, False Color, HONC, Wildfire)
- Priorité de sélection "date la plus proche" (préférence, pas exclusion,
  sur le seuil de nuages — pour ne jamais masquer une scène enfumée) ou
  "moins nuageux"
- Sélecteur manuel de date par côté quand la zone chevauche plusieurs dalles
  Sentinel-2 imagées à des jours différents
- Recherche de lieu (geocoding)
- Affichage de la date réelle et du taux de nuages de la scène trouvée
- Détection et message clair si aucune image n'est disponible pour les critères choisis
- Partage par URL (lieu + dates + mode + réglages)
- Export PNG/JPEG/GIF/WebM avec réglages (taille, qualité, durée/fluidité pour
  les animations, nom de fichier), bulles d'info datées gravées dans l'export
- Thème clair/sombre/auto, menu repliable, raccourcis clavier
- Détection du quota d'imagerie épuisé (HTTP 429 côté Sentinel Hub), avec
  message explicite au lieu de tuiles vides silencieuses
- Réglage avancé "Identifiant CDSE personnel" pour utiliser son propre quota
  gratuit plutôt que le quota partagé par défaut (stocké en local, jamais
  envoyé nulle part)

## Limites connues

- **Quota partagé** : l'Instance ID Sentinel Hub par défaut est visible dans
  le code source et n'est pas protégé — un usage abusif par un tiers
  consommerait le quota gratuit du compte. L'app détecte maintenant le cas
  (HTTP 429) et invite à renseigner un identifiant personnel plutôt que de
  laisser des tuiles vides sans explication, mais rien n'empêche encore
  l'abus lui-même côté serveur (pas de restriction de domaine ni de proxy).
- **Nominatim** : rate-limité (~1 req/s), sans clé — suffisant pour un usage
  perso mais pas pour un trafic important.
- **Export image** : capture exactement ce qui est affiché à l'écran (à la
  résolution choisie dans la modale d'export), pas une image satellite haute
  résolution indépendante du rendu de la carte.
