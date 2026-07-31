// Gemeinsame Makro-Rechnung für Ernährungsplan und Ernährungslog - beide Seiten zeigen
// dieselben Summen gegen dieselben Zielwerte, deshalb liegen Typ, Toleranzen und die
// Ampel-Logik hier statt doppelt in den Seiten.

export interface Sums {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

/** Zielwerte, wie sie `calculate()` liefert - hier nur der Teil, den die Bilanz braucht. */
export interface MacroTarget {
  targetCalories: number
  proteinG: number
  carbsG: number
  fatG: number
}

export const EMPTY_SUMS: Sums = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

// Ab welcher Abweichung vom Ziel ein Wert nicht mehr als "getroffen" gilt.
export const CAL_TOLERANCE = 100
export const MACRO_TOLERANCE = 15

/** Schnellauswahl für Portionsgrößen in Gramm. */
export const GRAM_PRESETS = [50, 100, 150, 200]

export function sumMacros(rows: Sums[]): Sums {
  return rows.reduce(
    (acc, r) => ({ kcal: acc.kcal + r.kcal, protein: acc.protein + r.protein, carbs: acc.carbs + r.carbs, fat: acc.fat + r.fat }),
    { ...EMPTY_SUMS },
  )
}

export function subtractMacros(a: Sums, b: Sums): Sums {
  return { kcal: a.kcal - b.kcal, protein: a.protein - b.protein, carbs: a.carbs - b.carbs, fat: a.fat - b.fat }
}

export function diffTone(diff: number, tolerance: number): 'ok' | 'danger' {
  return Math.abs(diff) <= tolerance ? 'ok' : 'danger'
}

export function diffToneClass(diff: number, tolerance: number): string {
  return diffTone(diff, tolerance) === 'ok' ? 'text-ok' : 'text-danger'
}
