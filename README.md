# Sentinel-2 Compare

Web app statique (HTML/JS, sans build) pour comparer deux images satellite
Sentinel-2 à des dates différentes, sur la même zone, avec un slider de
comparaison géoréférencé (pan/zoom synchronisés).

## Architecture

- **Carte** : [MapLibre GL JS](https://maplibre.org/) (aucune clé requise),
  fond de carte OpenStreetMap pour la navigation.
- **Imagerie Sentinel-2** : rendue côté serveur par le service **WMTS** de
  [Copernicus Data Space Ecosystem](https://dataspace.copernicus.eu/)
  (Sentinel Hub). Le frontend appelle directement ce WMTS — pas de backend,
  déployable tel quel sur GitHub Pages.
- **Métadonnées** (date réelle de l'acquisition, taux de nuages, détection
  d'absence de données) : requêtes en lecture seule vers le
  [STAC public d'AWS Earth Search](https://earth-search.aws.element84.com/v1/search)
  — n'affecte pas le rendu, seulement l'affichage d'info.
- **Recherche de lieu** : [Nominatim (OpenStreetMap)](https://nominatim.org/),
  gratuit, sans clé.
- **Swipe** : deux instances MapLibre superposées, synchronisées en caméra,
  avec un `clip-path` CSS piloté par un slider glissable.

Aucun de ces services ne nécessite de secret côté client — tout tourne dans
le navigateur.

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
6. Le coller dans [`js/config.js`](js/config.js) (`SH_INSTANCE_ID`), et vérifier
   que `MODE_LAYERS` pointe vers les bons Layer IDs si tu les as nommés différemment.

⚠️ L'Instance ID est **public par nature** (il est embarqué dans le code
frontend) — ce n'est pas un secret, mais **n'importe qui peut l'utiliser et
consommer ton quota gratuit** s'il le récupère depuis le code source. Pas de
restriction de domaine mise en place pour l'instant (voir "Limites connues").

## Lancer en local

Aucune dépendance, aucun build. Un simple serveur statique suffit :

```bash
python3 -m http.server 8765
```

Puis ouvrir `http://localhost:8765`.

## Déploiement (GitHub Pages)

1. Pousser le contenu du dépôt sur GitHub.
2. Dans les paramètres du repo → **Pages** → source = branche `main`, dossier `/ (root)`.
3. L'app est servie telle quelle, aucune étape de build.

## Fonctionnalités

- Comparaison swipe géoréférencée (pan/zoom synchronisés entre les deux dates)
- 4 modes de rendu (True Color, False Color, HONC, Wildfire)
- Réglage du seuil de nuages max et de la fenêtre de recherche de dates
- Recherche de lieu (geocoding)
- Affichage de la date réelle et du taux de nuages de la scène trouvée
- Détection et message clair si aucune image n'est disponible pour les critères choisis
- Partage par URL (lieu + dates + mode + réglages)
- Export de la vue de comparaison en PNG ou JPEG

## Limites connues

- **Quota partagé** : l'Instance ID Sentinel Hub est visible dans le code
  source et n'est pas protégé — un usage abusif par un tiers consommerait
  le quota gratuit du compte. À surveiller ; une solution de restriction
  (domaine autorisé côté CDSE, ou proxy) est à évaluer si ça devient un problème.
- **Métadonnées approximatives** : les infos de date réelle/nuages affichées
  viennent d'un index STAC différent (AWS Earth Search) de celui utilisé par
  le rendu WMTS (Sentinel Hub) — les deux indexent le même catalogue Sentinel-2
  L2A, donc les résultats sont normalement identiques, mais ce n'est pas garanti à 100%.
- **Nominatim** : rate-limité (~1 req/s), sans clé — suffisant pour un usage
  perso mais pas pour un trafic important.
- **Export image** : capture exactement ce qui est affiché à l'écran (résolution
  de la fenêtre du navigateur), pas une image satellite haute résolution.
