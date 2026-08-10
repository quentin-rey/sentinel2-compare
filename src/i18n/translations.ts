// Flat key -> string (or, for interpolated content, a function returning a
// string) translation dictionary. `fr`/`en` must stay structurally
// identical — the `Translations` type below enforces that at compile time.
// Rich, multi-paragraph content that mixes prose with links/emphasis
// (InfoModal's instructions) is deliberately NOT put here:
// building HTML out of interpolated strings is fragile, so those components
// keep two full JSX blocks selected by `lang` instead.

export interface Translations {
  // Shared
  closeAriaLabel: string;
  menuToggleTooltip: string;
  compareSliderAriaLabel: string;
  zoomInAriaLabel: string;
  zoomOutAriaLabel: string;
  loadingExactDatesBanner: string;

  // Navbar
  navAbout: string;
  navShortcuts: string;
  navGithub: string;
  navThemeTooltip: (p: { themeLabel: string }) => string;
  themeLabelAuto: string;
  themeLabelLight: string;
  themeLabelDark: string;

  // Accordion section titles
  sectionPlace: string;
  sectionDatesRender: string;
  sectionLayers: string;
  sectionExport: string;
  sectionShare: string;

  // Place search
  placeSearchLabel: string;
  placeSearchPlaceholder: string;

  // Admin layers (départements / villes overlays)
  layerDepartementsLabel: string;
  layerOpacityLabel: string;
  layerVillesLabel: string;
  layerVillesCountLabel: string;
  layerVillesMinPopulationValue: (p: { population: string }) => string;
  layerVillesMinPopulationAll: string;
  layerVillesZoomHint: string;
  layerVillesColorLabel: string;
  layerVillesHaloLabel: string;
  layerVillesSizeLabel: string;

  // Compare form
  date1Label: string;
  date2Label: string;
  quickWeek: string;
  quickMonth: string;
  quickYear: string;
  renderLabel: string;
  renderModeTrueColor: string;
  renderModeFalseColor: string;
  renderModeHonc: string;
  renderModeFire: string;
  renderModeSwir: string;
  priorityLabel: string;
  priorityClosest: string;
  priorityLeastCloud: string;
  priorityHint: string;
  advancedSettings: string;
  maxCloudLabel: string;
  maxCloudTooltip: string;
  windowDaysLabel: string;
  displayBtn: string;
  addCompareDatePrompt: string;
  compareBtn: string;
  closeBtn: string;

  // Export section
  exportImageLabel: string;
  exportImageSlide: string;
  exportImageBefore: string;
  exportImageAfter: string;
  exportPng: string;
  exportJpeg: string;
  exportAnimationLabel: string;
  exportGif: string;
  exportWebm: string;

  // Share
  shareBtn: string;

  // Shortcuts modal
  shortcutsTitle: string;
  shortcutMenu: string;
  shortcutClose: string;
  shortcutSlider: string;
  shortcutSliderFast: string;
  shortcutRecenter: string;
  kbdEscape: string;
  kbdShift: string;

  // Onboarding tour (issue #31)
  onboardingReplayBtn: string;
  onboardingStepCount: (p: { current: number; total: number }) => string;
  onboardingSkip: string;
  onboardingBack: string;
  onboardingNext: string;
  onboardingFinish: string;
  onboardingStep1Title: string;
  onboardingStep1Body: string;
  onboardingStep2Title: string;
  onboardingStep2Body: string;
  onboardingStep3Title: string;
  onboardingStep3Body: string;
  onboardingStep4Title: string;
  onboardingStep4Body: string;
  onboardingStep5Title: string;
  onboardingStep5Body: string;
  onboardingStep6Title: string;
  onboardingStep6Body: string;
  onboardingStep7Title: string;
  onboardingStep7Body: string;

  // Export settings modal
  exportOptionsTitle: string;
  sizeLabel: string;
  sizeOriginal: string;
  sizeHd: (p: { px: number }) => string;
  sizeCompact: (p: { px: number }) => string;
  sizeStandard: (p: { px: number }) => string;
  sizeHighRes: (p: { px: number }) => string;
  qualityLabel: (p: { percent: number }) => string;
  animStyleLabel: string;
  animStyleSlide: string;
  animStyleOpacity: string;
  durationLabel: (p: { seconds: number }) => string;
  fpsLabel: (p: { fps: number }) => string;
  holdLabel: (p: { seconds: number }) => string;
  frameCountHint: (p: { frames: number }) => string;
  filenameLabel: string;
  downloadBtn: string;

  // Export discard confirm modal
  discardTitle: string;
  discardBody: string;
  discardCancel: string;
  discardConfirm: string;

  // CompareLabel
  datePickerTooltip: string;
  partialSuffix: string;
  manualPickTooltip: string;
  loadingBefore: string;
  loadingAfter: string;
  loadingSingle: string;
  labelBefore: string;
  labelAfter: string;
  labelSingle: string;

  // Scene descriptions (useCompareMaps.ts)
  sceneApprox: (p: { label: string; date: string }) => string;
  sceneNotFound: (p: { label: string; date: string }) => string;
  sceneFound: (p: { label: string; date: string; cloud: string; tiles: number }) => string;
  labelApprox: (p: { prefix: string; date: string }) => string;
  labelNoImage: (p: { prefix: string }) => string;
  labelFound: (p: { prefix: string; approx: string; date: string; cloud: string }) => string;
  tooltipUnavailable: (p: { date: string; windowDays: number }) => string;
  tooltipNotFound: (p: { windowDays: number; date: string }) => string;
  tooltipFound: (p: { date: string; priorityLabel: string; windowDays: number }) => string;
  priorityLabelClosest: string;
  priorityLabelLeastCloud: string;
  internalError: string;

  // App-level status/toast messages
  chooseDate: string;
  chooseDates: string;
  dateOrderError: string;
  genericError: string;
  exportSuccess: (p: { kind: string }) => string;
  exportError: (p: { kind: string; err: string }) => string;
  animExportSuccess: (p: { label: string }) => string;
  animExportError: (p: { label: string; err: string }) => string;
  animLabelGif: string;
  animLabelWebm: string;
  generating: (p: { label: string; percent: number }) => string;
  generatingHighRes: string;
  highResRotatedFallback: string;
  highResUnresolvedFallback: string;
  highResLayersFallback: string;
  shareCopied: string;
}

export const translations: Record<"fr" | "en", Translations> = {
  fr: {
    closeAriaLabel: "Fermer",
    menuToggleTooltip: "Basculer le menu (touche M)",
    compareSliderAriaLabel: "Curseur de comparaison",
    zoomInAriaLabel: "Zoomer",
    zoomOutAriaLabel: "Dézoomer",
    loadingExactDatesBanner: "Recherche de la scène exacte et rendu de l'image en cours…",
    navAbout: "À propos",
    navShortcuts: "Raccourcis clavier",
    navGithub: "Code source (GitHub)",
    navThemeTooltip: ({ themeLabel }) => `Thème : ${themeLabel} — cliquer pour changer`,
    themeLabelAuto: "auto (système)",
    themeLabelLight: "clair",
    themeLabelDark: "sombre",

    sectionPlace: "Lieu",
    sectionDatesRender: "Dates & rendu",
    sectionLayers: "Couches",
    sectionExport: "Export",
    sectionShare: "Partage",

    placeSearchLabel: "Rechercher un lieu",
    placeSearchPlaceholder: "Ville, adresse, lieu…",

    layerDepartementsLabel: "Départements",
    layerOpacityLabel: "Opacité",
    layerVillesLabel: "Villes",
    layerVillesCountLabel: "Population minimale",
    layerVillesMinPopulationValue: ({ population }) => `≥ ${population} hab.`,
    layerVillesMinPopulationAll: "Toutes",
    layerVillesZoomHint: "D'autres villes apparaissent en zoomant.",
    layerVillesColorLabel: "Couleur du texte",
    layerVillesHaloLabel: "Contour",
    layerVillesSizeLabel: "Taille du texte",

    date1Label: "Date 1 (avant)",
    date2Label: "Date 2 (après)",
    quickWeek: "−1 sem",
    quickMonth: "−1 mois",
    quickYear: "−1 an",
    renderLabel: "Rendu",
    renderModeTrueColor: "Couleurs naturelles",
    renderModeFalseColor: "Fausses couleurs",
    renderModeHonc: "Highlight Optimized Natural Color",
    renderModeFire: "Feux de forêt",
    renderModeSwir: "SWIR (B11/B8A/B5)",
    priorityLabel: "Priorité de sélection",
    priorityClosest: "Date la plus proche",
    priorityLeastCloud: "Moins nuageux",
    priorityHint: "⚠️ La date affichée peut différer de la date demandée (priorité donnée à l'image la plus claire).",
    advancedSettings: "Réglages avancés",
    maxCloudLabel: "Nuages max (%)",
    maxCloudTooltip:
      'En mode "Date la plus proche" : préférence, pas une exclusion — si aucune date proche ne passe sous ce seuil, la date la plus proche s\'affiche quand même (ex. fumée d\'incendie).',
    windowDaysLabel: "Fenêtre (jours)",
    displayBtn: "Afficher",
    addCompareDatePrompt: "Comparer avec une autre date ?",
    compareBtn: "Comparer",
    closeBtn: "Fermer",

    exportImageLabel: "Image",
    exportImageSlide: "Comparaison (slide)",
    exportImageBefore: "Avant seul",
    exportImageAfter: "Après seul",
    exportPng: "PNG",
    exportJpeg: "JPEG",
    exportAnimationLabel: "Animation avant ↔ après",
    exportGif: "GIF animé",
    exportWebm: "Vidéo WebM",

    shareBtn: "Copier le lien de partage",

    shortcutsTitle: "Raccourcis clavier",
    shortcutMenu: "Basculer le menu",
    shortcutClose: "Fermer la comparaison ou une fenêtre ouverte",
    shortcutSlider: "Déplacer le slider",
    shortcutSliderFast: "Déplacer le slider plus vite",
    shortcutRecenter: "Double-clic sur le curseur : le recentrer",
    kbdEscape: "Échap",
    kbdShift: "Maj",

    onboardingReplayBtn: "Revoir la visite guidée",
    onboardingStepCount: ({ current, total }) => `Étape ${current}/${total}`,
    onboardingSkip: "Passer",
    onboardingBack: "Précédent",
    onboardingNext: "Suivant",
    onboardingFinish: "Terminer",
    onboardingStep1Title: "Cherchez un lieu",
    onboardingStep1Body: "Tapez le nom d'une ville ou d'une adresse pour centrer la carte dessus.",
    onboardingStep2Title: "Choisissez une date",
    onboardingStep2Body: "Sélectionnez la date à afficher, et éventuellement le rendu (couleurs naturelles, fausses couleurs, SWIR...).",
    onboardingStep3Title: "Affichez l'image",
    onboardingStep3Body: "Cliquez sur «Afficher» pour continuer — la visite reprendra automatiquement une fois l'image affichée.",
    onboardingStep4Title: "Comparez avec une autre date",
    onboardingStep4Body:
      "Cliquez sur «Comparer avec une autre date ?», choisissez une deuxième date, puis sur «Comparer» — la visite continuera automatiquement une fois la comparaison affichée.",
    onboardingStep5Title: "Calques",
    onboardingStep5Body: "Affichez les départements ou les villes en surimpression sur la carte.",
    onboardingStep6Title: "Export",
    onboardingStep6Body: "Exportez l'image en PNG/JPEG, ou générez une animation avant/après en GIF ou vidéo.",
    onboardingStep7Title: "Partage",
    onboardingStep7Body:
      "Copiez un lien vers exactement cette vue (lieu, dates, rendu) pour la partager. Vous pouvez revoir cette visite à tout moment via le bouton ⓘ.",

    exportOptionsTitle: "Options d'export",
    sizeLabel: "Taille",
    sizeOriginal: "Originale (résolution de l'écran)",
    sizeHd: ({ px }) => `HD (${px} px)`,
    sizeCompact: ({ px }) => `Compacte (${px} px)`,
    sizeStandard: ({ px }) => `Standard (${px} px)`,
    sizeHighRes: ({ px }) => `Haute résolution (${px} px, données satellite directes)`,
    qualityLabel: ({ percent }) => `Qualité (${percent}%)`,
    animStyleLabel: "Style d'animation",
    animStyleSlide: "Slide",
    animStyleOpacity: "Fondu (opacité)",
    durationLabel: ({ seconds }) => `Durée du cycle avant ↔ après (${seconds}s)`,
    fpsLabel: ({ fps }) => `Fluidité (${fps} im/s)`,
    holdLabel: ({ seconds }) => `Pause à chaque extrémité (${seconds}s)`,
    frameCountHint: ({ frames }) =>
      `≈ ${frames} images générées. Plus de durée/fluidité = un rendu plus doux mais un fichier plus lourd et plus long à générer.`,
    filenameLabel: "Nom du fichier",
    downloadBtn: "Télécharger",

    discardTitle: "Fermer sans exporter ?",
    discardBody: "Les réglages choisis seront perdus.",
    discardCancel: "Annuler",
    discardConfirm: "Fermer",

    datePickerTooltip: "Choisir une autre date disponible",
    partialSuffix: " (partiel)",
    manualPickTooltip: "Date choisie manuellement parmi les scènes disponibles.",
    loadingBefore: "Avant — chargement…",
    loadingAfter: "Après — chargement…",
    loadingSingle: "Chargement…",
    labelBefore: "Avant",
    labelAfter: "Après",
    labelSingle: "Affiché",

    sceneApprox: ({ label, date }) => `${label}: ~${date} (métadonnées indisponibles, date approximative).`,
    sceneNotFound: ({ label, date }) => `⚠️ ${label}: aucune image trouvée près du ${date}.`,
    sceneFound: ({ label, date, cloud, tiles }) => `${label}: ${date} (nuages ${cloud}%, ${tiles} dalle(s)).`,
    labelApprox: ({ prefix, date }) => `${prefix} — ~${date}`,
    labelNoImage: ({ prefix }) => `${prefix} — aucune image`,
    labelFound: ({ prefix, approx, date, cloud }) => `${prefix}${approx} — ${date} · ${cloud}% ☁`,
    tooltipUnavailable: ({ date, windowDays }) =>
      `Requête pour le ${date}. Métadonnées indisponibles : rendu de secours sur une fenêtre de ±${windowDays}j.`,
    tooltipNotFound: ({ windowDays, date }) => `Aucune scène trouvée dans une fenêtre de ±${windowDays}j autour du ${date}.`,
    tooltipFound: ({ date, priorityLabel, windowDays }) =>
      `Demandé : ${date}. Priorité : ${priorityLabel}. Fenêtre de recherche : ±${windowDays} jours.`,
    priorityLabelClosest: "date la plus proche",
    priorityLabelLeastCloud: "image la moins nuageuse",
    internalError: "Erreur interne : conteneurs de carte introuvables.",

    chooseDate: "Choisissez une date.",
    chooseDates: "Choisissez deux dates.",
    dateOrderError: 'La date "avant" doit être antérieure (ou égale) à la date "après".',
    genericError: "Une erreur est survenue.",
    exportSuccess: ({ kind }) => `Image ${kind} exportée.`,
    exportError: ({ kind, err }) => `Export ${kind} impossible : ${err}`,
    animExportSuccess: ({ label }) => `${label} exporté(e).`,
    animExportError: ({ label, err }) => `Export ${label} impossible : ${err}`,
    animLabelGif: "GIF",
    animLabelWebm: "vidéo WebM",
    generating: ({ label, percent }) => `Génération du ${label}… ${percent}%`,
    generatingHighRes: "Rendu haute résolution en cours… cela peut prendre un moment.",
    highResRotatedFallback: "Export haute résolution indisponible en vue pivotée/inclinée — export standard utilisé.",
    highResUnresolvedFallback: "Scène introuvable pour l'export haute résolution — export standard utilisé.",
    highResLayersFallback: "Export haute résolution indisponible avec les couches Villes/Départements — export standard utilisé.",
    shareCopied: "Lien de partage copié dans le presse-papiers.",
  },
  en: {
    closeAriaLabel: "Close",
    menuToggleTooltip: "Toggle menu (M key)",
    compareSliderAriaLabel: "Comparison slider",
    zoomInAriaLabel: "Zoom in",
    zoomOutAriaLabel: "Zoom out",
    loadingExactDatesBanner: "Finding the exact scene and rendering the image…",
    navAbout: "About",
    navShortcuts: "Keyboard shortcuts",
    navGithub: "Source code (GitHub)",
    navThemeTooltip: ({ themeLabel }) => `Theme: ${themeLabel} — click to change`,
    themeLabelAuto: "auto (system)",
    themeLabelLight: "light",
    themeLabelDark: "dark",

    sectionPlace: "Place",
    sectionDatesRender: "Dates & render",
    sectionLayers: "Layers",
    sectionExport: "Export",
    sectionShare: "Share",

    placeSearchLabel: "Search a place",
    placeSearchPlaceholder: "City, address, place…",

    layerDepartementsLabel: "Départements",
    layerOpacityLabel: "Opacity",
    layerVillesLabel: "Cities",
    layerVillesCountLabel: "Minimum population",
    layerVillesMinPopulationValue: ({ population }) => `≥ ${population} pop.`,
    layerVillesMinPopulationAll: "All",
    layerVillesZoomHint: "More cities appear as you zoom in.",
    layerVillesColorLabel: "Text color",
    layerVillesHaloLabel: "Outline",
    layerVillesSizeLabel: "Text size",

    date1Label: "Date 1 (before)",
    date2Label: "Date 2 (after)",
    quickWeek: "−1 wk",
    quickMonth: "−1 mo",
    quickYear: "−1 yr",
    renderLabel: "Render",
    renderModeTrueColor: "True Color",
    renderModeFalseColor: "False Color",
    renderModeHonc: "Highlight Optimized Natural Color",
    renderModeFire: "Wildfire",
    renderModeSwir: "SWIR (B11/B8A/B5)",
    priorityLabel: "Selection priority",
    priorityClosest: "Closest date",
    priorityLeastCloud: "Least cloudy",
    priorityHint: "⚠️ The date shown may differ from the requested one (priority given to the clearest image).",
    advancedSettings: "Advanced settings",
    maxCloudLabel: "Max clouds (%)",
    maxCloudTooltip:
      'In "Closest date" mode: a preference, not an exclusion — if no nearby date is under this threshold, the closest date is shown anyway (e.g. wildfire smoke).',
    windowDaysLabel: "Window (days)",
    displayBtn: "Display",
    addCompareDatePrompt: "Compare with another date?",
    compareBtn: "Compare",
    closeBtn: "Close",

    exportImageLabel: "Image",
    exportImageSlide: "Comparison (slide)",
    exportImageBefore: "Before only",
    exportImageAfter: "After only",
    exportPng: "PNG",
    exportJpeg: "JPEG",
    exportAnimationLabel: "Before ↔ after animation",
    exportGif: "Animated GIF",
    exportWebm: "WebM video",

    shareBtn: "Copy share link",

    shortcutsTitle: "Keyboard shortcuts",
    shortcutMenu: "Toggle the panel",
    shortcutClose: "Close the comparison or an open window",
    shortcutSlider: "Move the slider",
    shortcutSliderFast: "Move the slider faster",
    shortcutRecenter: "Double-click the handle to recenter it",
    kbdEscape: "Esc",
    kbdShift: "Shift",

    onboardingReplayBtn: "Replay the guided tour",
    onboardingStepCount: ({ current, total }) => `Step ${current}/${total}`,
    onboardingSkip: "Skip",
    onboardingBack: "Back",
    onboardingNext: "Next",
    onboardingFinish: "Finish",
    onboardingStep1Title: "Search for a place",
    onboardingStep1Body: "Type a city or address to center the map on it.",
    onboardingStep2Title: "Pick a date",
    onboardingStep2Body: "Pick the date to display, and optionally the render mode (true color, false color, SWIR...).",
    onboardingStep3Title: "Show the image",
    onboardingStep3Body: "Click «Display» to continue — the tour picks back up automatically once the image is shown.",
    onboardingStep4Title: "Compare with another date",
    onboardingStep4Body:
      "Click «Compare with another date?», pick a second date, then «Compare» — the tour continues automatically once the comparison is shown.",
    onboardingStep5Title: "Layers",
    onboardingStep5Body: "Overlay département boundaries or city labels on the map.",
    onboardingStep6Title: "Export",
    onboardingStep6Body: "Export the image as PNG/JPEG, or generate a before/after animation as a GIF or video.",
    onboardingStep7Title: "Share",
    onboardingStep7Body: "Copy a link to exactly this view (place, dates, render mode) to share it. You can replay this tour anytime from the ⓘ button.",

    exportOptionsTitle: "Export options",
    sizeLabel: "Size",
    sizeOriginal: "Original (screen resolution)",
    sizeHd: ({ px }) => `HD (${px} px)`,
    sizeCompact: ({ px }) => `Compact (${px} px)`,
    sizeStandard: ({ px }) => `Standard (${px} px)`,
    sizeHighRes: ({ px }) => `High resolution (${px} px, direct from satellite data)`,
    qualityLabel: ({ percent }) => `Quality (${percent}%)`,
    animStyleLabel: "Animation style",
    animStyleSlide: "Slide",
    animStyleOpacity: "Fade (opacity)",
    durationLabel: ({ seconds }) => `Before ↔ after cycle duration (${seconds}s)`,
    fpsLabel: ({ fps }) => `Smoothness (${fps} fps)`,
    holdLabel: ({ seconds }) => `Pause at each end (${seconds}s)`,
    frameCountHint: ({ frames }) =>
      `≈ ${frames} frames generated. More duration/smoothness = a smoother render but a heavier, slower-to-generate file.`,
    filenameLabel: "Filename",
    downloadBtn: "Download",

    discardTitle: "Close without exporting?",
    discardBody: "The chosen settings will be lost.",
    discardCancel: "Cancel",
    discardConfirm: "Close",

    datePickerTooltip: "Choose another available date",
    partialSuffix: " (partial)",
    manualPickTooltip: "Date manually chosen among the available scenes.",
    loadingBefore: "Before — loading…",
    loadingAfter: "After — loading…",
    loadingSingle: "Loading…",
    labelBefore: "Before",
    labelAfter: "After",
    labelSingle: "Displayed",

    sceneApprox: ({ label, date }) => `${label}: ~${date} (metadata unavailable, approximate date).`,
    sceneNotFound: ({ label, date }) => `⚠️ ${label}: no image found near ${date}.`,
    sceneFound: ({ label, date, cloud, tiles }) => `${label}: ${date} (clouds ${cloud}%, ${tiles} tile(s)).`,
    labelApprox: ({ prefix, date }) => `${prefix} — ~${date}`,
    labelNoImage: ({ prefix }) => `${prefix} — no image`,
    labelFound: ({ prefix, approx, date, cloud }) => `${prefix}${approx} — ${date} · ${cloud}% ☁`,
    tooltipUnavailable: ({ date, windowDays }) =>
      `Request for ${date}. Metadata unavailable: fallback render over a ±${windowDays}d window.`,
    tooltipNotFound: ({ windowDays, date }) => `No scene found within a ±${windowDays}d window around ${date}.`,
    tooltipFound: ({ date, priorityLabel, windowDays }) =>
      `Requested: ${date}. Priority: ${priorityLabel}. Search window: ±${windowDays} days.`,
    priorityLabelClosest: "closest date",
    priorityLabelLeastCloud: "least cloudy image",
    internalError: "Internal error: map containers not found.",

    chooseDate: "Choose a date.",
    chooseDates: "Choose two dates.",
    dateOrderError: 'The "before" date must be earlier than (or equal to) the "after" date.',
    genericError: "An error occurred.",
    exportSuccess: ({ kind }) => `${kind} image exported.`,
    exportError: ({ kind, err }) => `${kind} export failed: ${err}`,
    animExportSuccess: ({ label }) => `${label} exported.`,
    animExportError: ({ label, err }) => `${label} export failed: ${err}`,
    animLabelGif: "GIF",
    animLabelWebm: "WebM video",
    generating: ({ label, percent }) => `Generating ${label}… ${percent}%`,
    generatingHighRes: "Rendering at high resolution… this can take a moment.",
    highResRotatedFallback: "High-resolution export isn't available on a rotated/tilted view — used the standard export instead.",
    highResUnresolvedFallback: "Couldn't resolve the scene for a high-resolution export — used the standard export instead.",
    highResLayersFallback: "High-resolution export isn't available with the Cities/Départements layers — used the standard export instead.",
    shareCopied: "Share link copied to clipboard.",
  },
};

export type Lang = "fr" | "en";
export type TranslationKey = keyof Translations;
