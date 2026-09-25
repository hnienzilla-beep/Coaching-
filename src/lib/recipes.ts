// Rezepte sind Ernährungsplan-Phasen, die kein Tagesablauf sind, sondern ein Gericht: Die
// Zeilen beschreiben den kompletten Ansatz, und ins Tageslog wandert davon eine Portionszahl.
// Die Umrechnung steht hier, weil sie an drei Stellen gebraucht wird - Planseite (Anzeige je
// Portion), Log (Einfügen) und Vault-Export.

import type { NutritionPlan, PlanMeal } from '../models/types'

/** Auswahl für das Portionsfeld im Log - der Rest wird getippt. */
export const SERVING_PRESETS = [0.5, 1, 2]

/**
 * Ausbeute des kompletten Rezepts. Ohne gepflegten Wert (Altbestand, frisch umgestellte Phase)
 * gilt eine Portion: Dann ist die eingegebene Portionszahl direkt der Faktor, "0,5" also das
 * halbe Rezept.
 */
export function servingsOf(plan: Pick<NutritionPlan, 'servings'>): number {
  const value = plan.servings
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 1
}

/** Faktor, mit dem die Zutatenmengen zu multiplizieren sind. */
export function recipeFactor(plan: Pick<NutritionPlan, 'servings'>, eatenServings: number): number {
  return eatenServings / servingsOf(plan)
}

/**
 * Gewicht des kompletten Rezepts in Gramm: das gepflegte Fertiggewicht, sonst die Summe der
 * Zutaten. Beim Kochen verdampft Wasser - dann ist nur das Fertiggewicht genau.
 */
export function recipeWeight(plan: Pick<NutritionPlan, 'cookedWeightG'>, meals: Pick<PlanMeal, 'grams'>[]): number {
  const cooked = plan.cookedWeightG
  if (cooked !== undefined && Number.isFinite(cooked) && cooked > 0) return cooked
  return meals.reduce((sum, m) => sum + (Number.isFinite(m.grams) ? m.grams : 0), 0)
}

/** Faktor für eine gegessene Menge in Gramm - 0, wenn das Rezept kein Gewicht hat. */
export function recipeFactorFromGrams(weight: number, eatenGrams: number): number {
  return weight > 0 ? eatenGrams / weight : 0
}

/**
 * Skalierte Zutatenmenge. Auf eine Nachkommastelle gerundet: Ein Drittel von 1 g Salz wäre
 * sonst 0.3333333333333333 und stünde so auch im Vault.
 */
export function scaleGrams(grams: number, factor: number): number {
  return Math.round(grams * factor * 10) / 10
}

/** "0,5" statt "0.5" - und ohne Nachkommastelle, wo keine nötig ist. */
export function formatServings(servings: number): string {
  return servings.toLocaleString('de-DE', { maximumFractionDigits: 2 })
}

/** "2 Portionen" bzw. "1 Portion". */
export function servingsLabel(servings: number): string {
  return `${formatServings(servings)} ${servings === 1 ? 'Portion' : 'Portionen'}`
}
