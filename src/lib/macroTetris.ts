import { caloriesFromMacros } from './calculator'

type Macros = { protein: number; carbs: number; fat: number }
export type TetrisFood = Macros & { id: string; name: string }
export type TetrisCandidate = { food: TetrisFood; amounts: number[] }
export type TetrisPart = { food: TetrisFood; grams: number }
export type TetrisSuggestion = { parts: TetrisPart[]; totals: Macros & { kcal: number }; score: number }

function totalsOf(parts: TetrisPart[]): Macros & { kcal: number } {
  const t = parts.reduce(
    (acc, { food, grams }) => ({
      protein: acc.protein + (food.protein * grams) / 100,
      carbs: acc.carbs + (food.carbs * grams) / 100,
      fat: acc.fat + (food.fat * grams) / 100,
    }),
    { protein: 0, carbs: 0, fat: 0 },
  )
  return { ...t, kcal: caloriesFromMacros(t.protein, t.carbs, t.fat) }
}

/**
 * Wie gut füllt eine Kombination die Lücke? Quadrierte relative Abweichung je Makro (Protein
 * zählt doppelt), dazu eine kräftige Strafe fürs Überschreiten der restlichen Kalorien.
 * Kleiner ist besser.
 */
export function fillScore(totals: Macros & { kcal: number }, remaining: Macros & { kcal: number }): number {
  const rel = (got: number, want: number) => (Math.max(0, want) - got) / Math.max(10, want)
  let score = 2 * rel(totals.protein, remaining.protein) ** 2 + rel(totals.carbs, remaining.carbs) ** 2 + rel(totals.fat, remaining.fat) ** 2
  const over = totals.kcal - remaining.kcal
  if (over > 0) score += (over / Math.max(100, remaining.kcal)) * 6
  return score
}

/**
 * "Makro-Tetris": Welche ein oder zwei deiner üblichen Lebensmittel füllen den Rest des Tages am
 * besten? Probiert alle Einzel- und Zweierkombinationen der vorgegebenen Mengen durch und gibt
 * die besten `max` zurück - jede mit anderen Lebensmitteln.
 */
export function suggestFill(remaining: Macros & { kcal: number }, candidates: TetrisCandidate[], max = 3): TetrisSuggestion[] {
  if (remaining.kcal < 100) return []
  const options: TetrisPart[] = candidates.flatMap((c) => c.amounts.filter((g) => g > 0).map((grams) => ({ food: c.food, grams })))
  const all: TetrisSuggestion[] = []
  const consider = (parts: TetrisPart[]) => {
    const totals = totalsOf(parts)
    // Zu wenig, um eine echte Lücke zu schließen, oder deutlich über dem Rest - weglassen.
    if (totals.kcal < remaining.kcal * 0.35 || totals.kcal > remaining.kcal + 120) return
    all.push({ parts, totals, score: fillScore(totals, remaining) })
  }
  for (let i = 0; i < options.length; i++) {
    consider([options[i]])
    for (let j = i + 1; j < options.length; j++) {
      if (options[j].food.id === options[i].food.id) continue
      consider([options[i], options[j]])
    }
  }
  all.sort((a, b) => a.score - b.score)
  const picked: TetrisSuggestion[] = []
  const usedKeys = new Set<string>()
  for (const s of all) {
    const key = s.parts
      .map((p) => p.food.id)
      .sort()
      .join('+')
    if (usedKeys.has(key)) continue
    usedKeys.add(key)
    picked.push(s)
    if (picked.length >= max) break
  }
  return picked
}
