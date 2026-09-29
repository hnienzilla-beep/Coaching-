import type { Athlete } from '../models/types'

/** Trinkziel: eigenes, sonst 35 ml je kg Körpergewicht, auf 250 ml gerundet (2–4,5 l). */
export function waterGoalFor(athlete: Pick<Athlete, 'waterGoalMl' | 'weightKg'>, weightKg?: number): number {
  if (athlete.waterGoalMl && athlete.waterGoalMl > 0) return athlete.waterGoalMl
  const raw = (weightKg ?? athlete.weightKg) * 35
  return Math.min(4500, Math.max(2000, Math.round(raw / 250) * 250))
}
