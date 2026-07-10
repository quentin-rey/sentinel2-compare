// Flat key -> string (or, for interpolated content, a function returning a
// string) translation dictionary. `fr`/`en` must stay structurally
// identical — the `Translations` type below enforces that at compile time.
// Rich, multi-paragraph content that mixes prose with links/emphasis
// (InfoModal, InstanceIdModal's instructions) is deliberately NOT put here:
// building HTML out of interpolated strings is fragile, so those components
// keep two full JSX blocks selected by `lang` instead.

export interface Translations {
  // Shared
  closeAriaLabel: string;
  menuToggleTooltip: string;
  compareSliderAriaLabel: string;
  loadingExactDatesBanner: string;

  // Navbar
  navAbout: string;
  navShortcuts: string;
  navInstanceIdActive: string;
  navInstanceIdInactive: string;
  navGithub: string;
  navThemeTooltip: (p: { themeLabel: string }) => string;
  themeLabelAuto: string;
  themeLabelLight: string;
  themeLabelDark: string;

  // Accordion section titles
  sectionPlace: string;
  sectionDatesRender: string;
  sectionExport: string;
  sectionShare: string;

  // Place search
  placeSearchLabel: string;
  placeSearchPlaceholder: string;

  // Compare form
  date1Label: string;
  date2Label: string;
  quickWeek: string;
  quickMonth: string;
  quickYear: string;
  renderLabel: string;
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

  // Instance ID modal (atomic bits only — rich body is inline JSX)
  instanceIdTitle: string;
  instanceIdActiveStatus: string;
  instanceIdInactiveStatus: string;
  instanceIdFieldLabel: string;
  instanceIdPlaceholder: string;
  instanceIdRevert: string;
  instanceIdHowTo: string;

  // Export settings modal
  exportOptionsTitle: string;
  sizeLabel: string;
  sizeOriginal: string;
  sizeHd: (p: { px: number }) => string;
  sizeCompact: (p: { px: number }) => string;
  sizeStandard: (p: { px: number }) => string;
  qualityLabel: (p: { percent: number }) => string;
  durationLabel: (p: { seconds: number }) => string;
  fpsLabel: (p: { fps: number }) => string;
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
  quotaExceededCustom: string;
  quotaExceededShared: string;
  exportSuccess: (p: { kind: string }) => string;
  exportError: (p: { kind: string; err: string }) => string;
  animExportSuccess: (p: { label: string }) => string;
  animExportError: (p: { label: string; err: string }) => string;
  animLabelGif: string;
  animLabelWebm: string;
  generating: (p: { label: string; percent: number }) => string;
  shareCopied: string;
}

export const translations: Record<"fr" | "en", Translations> = {
  fr: {
    closeAriaLabel: "Fermer",
    menuToggleTooltip: "Basculer le menu (touche M)",
    compareSliderAriaLabel: "Curseur de comparaison",
    loadingExactDatesBanner: "Chargement des dates exactes en cours… l'aperçu affiché peut être approximatif.",
    navAbout: "À propos",
    navShortcuts: "Raccourcis clavier",
    navInstanceIdActive: "Identifiant CDSE personnel actif",
    navInstanceIdInactive: "Utiliser mon propre identifiant CDSE (quota)",
    navGithub: "Code source (GitHub)",
    navThemeTooltip: ({ themeLabel }) => `Thème : ${themeLabel} — cliquer pour changer`,
    themeLabelAuto: "auto (système)",
    themeLabelLight: "clair",
    themeLabelDark: "sombre",

    sectionPlace: "Lieu",
    sectionDatesRender: "Dates & rendu",
    sectionExport: "Export",
    sectionShare: "Partage",

    placeSearchLabel: "Rechercher un lieu",
    placeSearchPlaceholder: "Ville, adresse, lieu...",

    date1Label: "Date 1 (avant)",
    date2Label: "Date 2 (après)",
    quickWeek: "−1 sem",
    quickMonth: "−1 mois",
    quickYear: "−1 an",
    renderLabel: "Rendu",
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

    instanceIdTitle: "Identifiant CDSE personnel",
    instanceIdActiveStatus: "✓ Identifiant personnel actif — tu utilises ton propre quota.",
    instanceIdInactiveStatus: "Aucun identifiant renseigné — quota partagé utilisé.",
    instanceIdFieldLabel: "Identifiant CDSE (Instance ID)",
    instanceIdPlaceholder: "Utilise le quota partagé par défaut",
    instanceIdRevert: "Revenir au quota partagé",
    instanceIdHowTo: "Comment l'obtenir (gratuit, ~5 minutes)",

    exportOptionsTitle: "Options d'export",
    sizeLabel: "Taille",
    sizeOriginal: "Originale (haute résolution)",
    sizeHd: ({ px }) => `HD (${px} px)`,
    sizeCompact: ({ px }) => `Compacte (${px} px)`,
    sizeStandard: ({ px }) => `Standard (${px} px)`,
    qualityLabel: ({ percent }) => `Qualité (${percent}%)`,
    durationLabel: ({ seconds }) => `Durée du cycle avant ↔ après (${seconds}s)`,
    fpsLabel: ({ fps }) => `Fluidité (${fps} im/s)`,
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

    chooseDate: "Choisis une date.",
    chooseDates: "Choisis deux dates.",
    dateOrderError: 'La date "avant" doit être antérieure (ou égale) à la date "après".',
    genericError: "Une erreur est survenue.",
    quotaExceededCustom:
      "Quota d'imagerie épuisé pour l'identifiant CDSE renseigné. Réessaie plus tard ou vérifie ton quota sur le tableau de bord Copernicus.",
    quotaExceededShared:
      "Quota d'imagerie partagé épuisé. Renseigne ton propre identifiant CDSE (gratuit) pour ne plus dépendre du quota commun, ou réessaie plus tard.",
    exportSuccess: ({ kind }) => `Image ${kind} exportée.`,
    exportError: ({ kind, err }) => `Export ${kind} impossible : ${err}`,
    animExportSuccess: ({ label }) => `${label} exporté(e).`,
    animExportError: ({ label, err }) => `Export ${label} impossible : ${err}`,
    animLabelGif: "GIF",
    animLabelWebm: "vidéo WebM",
    generating: ({ label, percent }) => `Génération du ${label}… ${percent}%`,
    shareCopied: "Lien de partage copié dans le presse-papiers.",
  },
  en: {
    closeAriaLabel: "Close",
    menuToggleTooltip: "Toggle menu (M key)",
    compareSliderAriaLabel: "Comparison slider",
    loadingExactDatesBanner: "Loading exact dates… the preview shown may be approximate.",
    navAbout: "About",
    navShortcuts: "Keyboard shortcuts",
    navInstanceIdActive: "Personal CDSE ID active",
    navInstanceIdInactive: "Use my own CDSE ID (quota)",
    navGithub: "Source code (GitHub)",
    navThemeTooltip: ({ themeLabel }) => `Theme: ${themeLabel} — click to change`,
    themeLabelAuto: "auto (system)",
    themeLabelLight: "light",
    themeLabelDark: "dark",

    sectionPlace: "Place",
    sectionDatesRender: "Dates & render",
    sectionExport: "Export",
    sectionShare: "Share",

    placeSearchLabel: "Search a place",
    placeSearchPlaceholder: "City, address, place...",

    date1Label: "Date 1 (before)",
    date2Label: "Date 2 (after)",
    quickWeek: "−1 wk",
    quickMonth: "−1 mo",
    quickYear: "−1 yr",
    renderLabel: "Render",
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

    instanceIdTitle: "Personal CDSE ID",
    instanceIdActiveStatus: "✓ Personal ID active — you're using your own quota.",
    instanceIdInactiveStatus: "No ID set — shared quota in use.",
    instanceIdFieldLabel: "CDSE ID (Instance ID)",
    instanceIdPlaceholder: "Uses the shared quota by default",
    instanceIdRevert: "Revert to shared quota",
    instanceIdHowTo: "How to get one (free, ~5 minutes)",

    exportOptionsTitle: "Export options",
    sizeLabel: "Size",
    sizeOriginal: "Original (high resolution)",
    sizeHd: ({ px }) => `HD (${px} px)`,
    sizeCompact: ({ px }) => `Compact (${px} px)`,
    sizeStandard: ({ px }) => `Standard (${px} px)`,
    qualityLabel: ({ percent }) => `Quality (${percent}%)`,
    durationLabel: ({ seconds }) => `Before ↔ after cycle duration (${seconds}s)`,
    fpsLabel: ({ fps }) => `Smoothness (${fps} fps)`,
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
    quotaExceededCustom:
      "Imagery quota exhausted for the CDSE ID you set. Try again later or check your quota on the Copernicus dashboard.",
    quotaExceededShared:
      "Shared imagery quota exhausted. Set your own free CDSE ID to stop depending on the common quota, or try again later.",
    exportSuccess: ({ kind }) => `${kind} image exported.`,
    exportError: ({ kind, err }) => `${kind} export failed: ${err}`,
    animExportSuccess: ({ label }) => `${label} exported.`,
    animExportError: ({ label, err }) => `${label} export failed: ${err}`,
    animLabelGif: "GIF",
    animLabelWebm: "WebM video",
    generating: ({ label, percent }) => `Generating ${label}… ${percent}%`,
    shareCopied: "Share link copied to clipboard.",
  },
};

export type Lang = "fr" | "en";
export type TranslationKey = keyof Translations;
