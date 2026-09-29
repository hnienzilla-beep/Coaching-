import type { Athlete } from '../models/types'

/** Zuschlag bei Kreatin-Einnahme. */
export const CREATINE_WATER_ML = 1000

/** Ob ein Supplement-Name Kreatin ist (Kreatin Monohydrat, Creatin HCL, …). */
export function isCreatine(name: string): boolean {
  return /kreatin|creatin/i.test(name)
}

/**
 * Trinkziel: eigenes, sonst 1 l je 20 kg Körpergewicht (50 ml/kg), bei Kreatin 1 l obendrauf.
 * Auf 250 ml gerundet.
 */
export function waterGoalFor(athlete: Pick<Athlete, 'waterGoalMl' | 'weightKg'>, weightKg?: number, creatine = false): number {
  if (athlete.waterGoalMl && athlete.waterGoalMl > 0) return athlete.waterGoalMl
  const raw = ((weightKg ?? athlete.weightKg) / 20) * 1000 + (creatine ? CREATINE_WATER_ML : 0)
  return Math.max(250, Math.round(raw / 250) * 250)
}
