import { addDays } from '../db/queries'

/** Montag der Woche, in der `iso` liegt. */
export function startOfWeek(iso: string): string {
  const weekday = (new Date(`${iso}T00:00:00`).getDay() + 6) % 7 // Sonntag (0) ans Wochenende schieben
  return addDays(iso, -weekday)
}
