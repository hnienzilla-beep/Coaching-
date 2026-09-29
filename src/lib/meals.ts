import { mealTypeForTime } from './calculator'
import { activeMeals, getPrefs } from './prefs'
import { MEAL_TYPES, type MealType } from '../models/types'

/**
 * Vorgeschlagene Mahlzeit für jetzt - wie `mealTypeForTime`, aber nur unter den eingeschalteten
 * Mahlzeiten (Einstellungen → Ernährung). Ist die passende aus, zählt die nächste danach, sonst
 * die davor.
 */
export function suggestedMeal(date: Date = new Date()): MealType {
  const enabled = new Set(activeMeals(getPrefs()).map((m) => m.slot))
  const wanted = mealTypeForTime(date)
  if (enabled.has(wanted)) return wanted
  const i = MEAL_TYPES.indexOf(wanted)
  const after = MEAL_TYPES.slice(i + 1).find((m) => enabled.has(m))
  const before = [...MEAL_TYPES.slice(0, i)].reverse().find((m) => enabled.has(m))
  return after ?? before ?? wanted
}
