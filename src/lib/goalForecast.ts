import { addDays } from '../db/queries'

export type Forecast =
  | { kind: 'insufficient' }
  | { kind: 'reached'; current: number }
  | { kind: 'away'; current: number; perWeek: number }
  | { kind: 'eta'; current: number; perWeek: number; date: string; days: number }

function dayIndex(iso: string): number {
  return Math.round(new Date(`${iso}T00:00:00Z`).getTime() / 86_400_000)
}

/**
 * Zielprognose aus dem Gewichtsverlauf der letzten `windowDays` Tage (Standard 3 Wochen): lineare Regression über alle
 * Wiegungen (robuster als erster gegen letzten Wert). Braucht mindestens 5 Wiegungen über
 * mindestens 7 Tage. Liegt das Ziel weiter als ein Jahr weg, gilt es als "zu weit".
 */
export function forecastGoal(points: { date: string; weightKg?: number }[], targetKg: number, today: string, windowDays = 21): Forecast {
  const since = addDays(today, -(windowDays - 1))
  const pts = points
    .filter((p) => p.weightKg !== undefined && p.date >= since && p.date <= today)
    .map((p) => ({ x: dayIndex(p.date), y: p.weightKg as number }))
  if (pts.length < 5) return { kind: 'insufficient' }
  const xs = pts.map((p) => p.x)
  if (Math.max(...xs) - Math.min(...xs) < 7) return { kind: 'insufficient' }

  const n = pts.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = pts.reduce((a, p) => a + p.y, 0) / n
  const sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0)
  const slope = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx
  const current = Math.round((my + slope * (dayIndex(today) - mx)) * 10) / 10
  const perWeek = Math.round(slope * 7 * 100) / 100

  const gap = targetKg - current
  if (Math.abs(gap) < 0.3) return { kind: 'reached', current }
  // Unter 50 g pro Woche ist praktisch Stillstand - daraus eine Prognose zu machen, wäre Unsinn.
  if (Math.sign(gap) !== Math.sign(slope) || Math.abs(slope * 7) < 0.05) return { kind: 'away', current, perWeek }
  const days = Math.ceil(gap / slope)
  if (days > 365) return { kind: 'away', current, perWeek }
  return { kind: 'eta', current, perWeek, days, date: addDays(today, days) }
}
