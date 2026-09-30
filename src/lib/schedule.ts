import type { Athlete } from '../models/types'

/*
 * Wochenplan eines Athleten: feste Wochentage (mit Einheit je Tag) oder ein rotierender
 * Rhythmus wie „1 an / 1 aus“ ab einem Startdatum.
 */

const DAY_MS = 86_400_000

/** Wochentag 0 = Montag … 6 = Sonntag. */
export function weekdayOf(date: string): number {
  return (new Date(`${date}T00:00:00`).getDay() + 6) % 7
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

type ScheduleAthlete = Pick<Athlete, 'trainingDays' | 'schedule'>

/** Ob an diesem Tag laut Plan Pause ist. Ohne geplante Tage gibt es keine Ruhetage. */
export function isRestDay(athlete: ScheduleAthlete, date: string): boolean {
  const s = athlete.schedule
  if (s?.mode === 'rotation') {
    const diff = daysBetween(s.start, date)
    if (diff < 0) return true
    return diff % (s.on + s.off) >= s.on
  }
  const days = athlete.trainingDays ?? []
  return days.length > 0 && !days.includes(weekdayOf(date))
}

/** Feste Tage: die für diesen Wochentag geplante Einheit (Plan-Reihenfolge), sonst undefined. */
export function plannedUnitFor(athlete: ScheduleAthlete, date: string): number | undefined {
  const s = athlete.schedule
  if (s?.mode !== 'fixed' || !s.dayPlans) return undefined
  const days = [...(athlete.trainingDays ?? [])].sort((x, y) => x - y)
  const i = days.indexOf(weekdayOf(date))
  return i === -1 ? undefined : s.dayPlans[i]
}

/** Kurzbeschreibung für Anzeigen: „Mo, Mi, Fr“ bzw. „1 an / 1 aus“. */
export function scheduleLabel(athlete: ScheduleAthlete): string {
  const s = athlete.schedule
  if (s?.mode === 'rotation') return `${s.on} an / ${s.off} aus`
  const names = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
  return [...(athlete.trainingDays ?? [])].sort((x, y) => x - y).map((d) => names[d]).join(', ')
}
