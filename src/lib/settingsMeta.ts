import type { HintKey, NutritionCard, Prefs, TabKey, TrackingCard, TrackingValue, TrainingCard } from './prefs'

/** Beschriftungen für Listen-Einstellungen - von der Einstellungsseite und den Reitern genutzt. */
export const TAB_LABELS: Record<TabKey, string> = {
  dashboard: 'Dashboard',
  tracking: 'Tracking',
  ernaehrung: 'Ernährung',
  training: 'Training',
}

export const SUB_VIEWS: Record<'ernaehrung' | 'training', { key: string; label: string }[]> = {
  ernaehrung: [
    { key: 'log', label: 'Log' },
    { key: 'plan', label: 'Plan' },
    { key: 'supplements', label: 'Supplements' },
  ],
  training: [
    { key: 'log', label: 'Log' },
    { key: 'plan', label: 'Plan' },
  ],
}

export const HINTS: { id: HintKey; label: string; hint: string }[] = [
  { id: 'weight', label: 'Wiegen', hint: 'Wenn heute noch kein Gewicht da ist' },
  { id: 'protein', label: 'Protein', hint: 'Wie viel Protein noch offen ist' },
  { id: 'kcal', label: 'Kalorien', hint: 'Wie viel Luft noch bleibt' },
  { id: 'water', label: 'Wasser', hint: 'Wie viel bis zum Wasserziel fehlt' },
]

export const TRACKING_VALUES: { id: TrackingValue; label: string; hint: string }[] = [
  { id: 'bodyFat', label: 'Körperfett (KFA)', hint: 'Eingabe und Diagramm' },
  { id: 'measures', label: 'Maße', hint: 'Bauch, Arm, Brust, Bein' },
  { id: 'extraMeasures', label: 'Weitere Maße', hint: 'Hüfte, Po, Wade, Nacken' },
  { id: 'sleep', label: 'Schlaf', hint: 'Stunden pro Nacht' },
  { id: 'steps', label: 'Schritte', hint: 'Schritte pro Tag' },
]

export const TRACKING_CARDS: { id: TrackingCard; label: string; hint: string }[] = [
  { id: 'wochenvergleich', label: 'Kalenderwoche im Vergleich', hint: 'Ø Gewicht dieser gegen letzte Woche' },
  { id: 'diagramm', label: 'Diagramm', hint: 'Gewicht, KFA, Maße' },
  { id: 'verlauf', label: 'Verlauf', hint: 'Liste der Einträge' },
  { id: 'export', label: 'Export/Import', hint: 'Fortschritt als Datei' },
]

export const NUTRITION_CARDS: { id: NutritionCard; label: string; hint: string }[] = [
  { id: 'wasser', label: 'Wasser', hint: 'Glas mit Knöpfen' },
  { id: 'tetris', label: 'Was noch passt', hint: 'Vorschläge für die restlichen Makros' },
  { id: 'details', label: 'Details (Ist/Ziel/Differenz)', hint: 'Tabelle' },
  { id: 'verlauf', label: 'Verlauf', hint: 'Frühere Tage' },
]

export const TRAINING_CARDS: { id: TrainingCard; label: string; hint: string }[] = [
  { id: 'timer', label: 'Pausen-Timer', hint: 'Zeile über den Übungen' },
  { id: 'heatmap', label: 'Muskel-Heatmap', hint: 'Figur der letzten 7 Tage' },
  { id: 'kraft', label: 'Kraft-Diagramm', hint: 'Gewichtsverlauf je Übung' },
  { id: 'notizen', label: 'Notizen zum Training', hint: 'Freitext und Beenden' },
  { id: 'verlauf', label: 'Verlauf', hint: 'Frühere Einheiten' },
]

export type SectionKey =
  | 'darstellung'
  | 'navigation'
  | 'dashboard'
  | 'tracking'
  | 'ernaehrung'
  | 'training'
  | 'einheiten'
  | 'story'
  | 'erinnerungen'
  | 'daten'
  | 'verwaltung'
  | 'info'

export const SECTIONS: { key: SectionKey; label: string; hint: string; prefs: (keyof Prefs)[]; search: string[] }[] = [
  {
    key: 'darstellung',
    label: 'Darstellung',
    hint: 'Farbschema, Akzent, Schrift, Animationen',
    prefs: ['fontSize', 'contrast', 'animations', 'haptics', 'confetti', 'tour', 'toursSeen'],
    search: ['hell', 'dunkel', 'system', 'farbe', 'akzent', 'ansicht', 'einfach', 'coach', 'schrift', 'größe', 'kontrast', 'animation', 'bewegung', 'haptik', 'vibration', 'konfetti', 'feiern', 'hintergrund', 'bild', 'hilfe', 'tour', 'hinweise'],
  },
  {
    key: 'navigation',
    label: 'Navigation',
    hint: 'Reiter, Startseite, Unteransichten',
    prefs: ['tabOrder', 'hiddenTabs', 'startTab', 'hiddenSubViews', 'startSubView', 'quickAddButton'],
    search: ['reiter', 'tab', 'reihenfolge', 'start', 'startseite', 'unteransicht', 'log', 'plan', 'supplements', 'plus', 'knopf', 'eintragen'],
  },
  {
    key: 'dashboard',
    label: 'Dashboard',
    hint: 'Karten, Hinweise, Wasser-Mengen',
    prefs: ['dashboardOrder', 'dashboardHidden', 'hiddenHints', 'waterAmounts'],
    search: ['karten', 'sortieren', 'ausblenden', 'nächster schritt', 'hinweis', 'wasser', 'mengen', 'kalender', 'zielgewicht'],
  },
  {
    key: 'tracking',
    label: 'Tracking',
    hint: 'Werte, Zeitraum, Karten',
    prefs: ['trackingValues', 'trackingRange', 'trackingHidden'],
    search: ['kfa', 'körperfett', 'maße', 'hüfte', 'po', 'wade', 'nacken', 'schlaf', 'schritte', 'zeitraum', 'diagramm', 'verlauf'],
  },
  {
    key: 'ernaehrung',
    label: 'Ernährung',
    hint: 'Mahlzeiten, Karten, Schritte, Toleranz',
    prefs: ['meals', 'nutritionHidden', 'gramStep', 'kcalTolerance'],
    search: ['mahlzeit', 'frühstück', 'snack', 'umbenennen', 'wasser', 'tetris', 'gramm', 'schritt', 'toleranz', 'kalorien'],
  },
  {
    key: 'training',
    label: 'Training',
    hint: 'Pausen-Timer, RPE, Karten',
    prefs: ['showRpe', 'trainingHidden'],
    search: ['pause', 'timer', 'rpe', 'heatmap', 'kraft', 'notizen', 'aufwärmen'],
  },
  {
    key: 'einheiten',
    label: 'Einheiten',
    hint: 'kg/lbs, cm/inch, ml/oz',
    prefs: ['weightUnit', 'lengthUnit', 'volumeUnit'],
    search: ['kg', 'lbs', 'pfund', 'cm', 'inch', 'zoll', 'ml', 'oz', 'unze', 'einheit'],
  },
  {
    key: 'story',
    label: 'Wochen-Story',
    hint: 'Folien, automatisch öffnen',
    prefs: ['storyAutoOpen'],
    search: ['story', 'rückblick', 'folien', 'montag'],
  },
  {
    key: 'erinnerungen',
    label: 'Erinnerungen',
    hint: 'Wiegen, Essen, Wasser',
    prefs: ['reminders'],
    search: ['erinnerung', 'benachrichtigung', 'wiegen', 'essen', 'wasser', 'uhrzeit'],
  },
  {
    key: 'daten',
    label: 'Daten & Sicherung',
    hint: 'Backup, CSV-Export',
    prefs: [],
    search: ['backup', 'sichern', 'import', 'export', 'csv', 'tabelle'],
  },
  {
    key: 'verwaltung',
    label: 'Verwaltung',
    hint: 'Athleten, Datenbanken, Sync',
    prefs: [],
    search: ['athleten', 'lebensmittel', 'datenbank', 'supplemente', 'übungen', 'obsidian', 'sync'],
  },
  {
    key: 'info',
    label: 'Über die App',
    hint: 'Version, Neuigkeiten, Speicher',
    prefs: [],
    search: ['version', 'neu', 'änderungen', 'speicher', 'platz'],
  },
]
