import { caloriesFromMacros } from './calculator'

export type QuickMacros = { protein: number; carbs: number; fat: number }

/**
 * Makros für einen Schnell-Eintrag: Sind Makros angegeben, gelten sie. Kennt man nur die
 * Kalorien ("Restaurant ca. 900 kcal"), werden sie im Verhältnis der Tagesvorgabe verteilt -
 * so bleibt die Kalorienzahl exakt, und die Makros sind eine plausible Schätzung.
 */
export function quickMacros(input: { kcal?: number; protein?: number; carbs?: number; fat?: number }, target: QuickMacros): QuickMacros | undefined {
  const protein = input.protein ?? 0
  const carbs = input.carbs ?? 0
  const fat = input.fat ?? 0
  if (protein > 0 || carbs > 0 || fat > 0) return { protein, carbs, fat }
  const kcal = input.kcal ?? 0
  const targetKcal = caloriesFromMacros(target.protein, target.carbs, target.fat)
  if (!(kcal > 0) || !(targetKcal > 0)) return undefined
  const factor = kcal / targetKcal
  const round1 = (n: number) => Math.round(n * 10) / 10
  return { protein: round1(target.protein * factor), carbs: round1(target.carbs * factor), fat: round1(target.fat * factor) }
}
