import { useStoredSet } from './storedSet'

/** Karten des Dashboards, die sich in den Einstellungen ausblenden lassen. "Heute" bleibt immer. */
export const DASHBOARD_CARDS = [
  { id: 'naechsterSchritt', label: 'Nächster Schritt', hint: 'Was heute noch offen ist' },
  { id: 'trainingHeute', label: 'Training heute', hint: 'Plan-Tag mit Start-Knopf' },
  { id: 'woche', label: 'Wochenwerte', hint: 'Ø kcal und Trainings der letzten 7 Tage' },
  { id: 'story', label: 'Wochen-Story', hint: 'Rückblick-Karte' },
  { id: 'ziel', label: 'Zielgewicht', hint: 'Fortschritt und Prognose' },
  { id: 'kalender', label: 'Kalender', hint: 'Monatsübersicht' },
  { id: 'rechenweg', label: 'Rechenweg', hint: 'Grundumsatz und Gesamtumsatz' },
  { id: 'export', label: 'Bericht exportieren', hint: 'PDF-Bericht' },
] as const
export type DashboardCardId = (typeof DASHBOARD_CARDS)[number]['id']

export function useHiddenDashboardCards() {
  return useStoredSet<DashboardCardId>('coach.dashboard.hidden')
}
