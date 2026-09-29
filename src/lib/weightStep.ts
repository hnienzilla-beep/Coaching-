/*
 * Schrittweite der ± Knöpfe beim Gewicht einer Übung. Reihenfolge: selbst eingestellt, sonst
 * aus dem eigenen Verlauf gelernt (welche Sprünge man tatsächlich macht), sonst aus dem Namen
 * geraten (Kurzhantel 2 kg, Maschine/Kabel 5 kg, Langhantel 2,5 kg).
 */

export const WEIGHT_STEPS = [1, 1.25, 2, 2.5, 5, 10] as const

function nearestStep(n: number): number {
  return WEIGHT_STEPS.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), 2.5)
}

/** Aus dem Verlauf: der häufigste Abstand zwischen benachbarten, verschiedenen Gewichten. */
export function learnedStep(weights: number[]): number | undefined {
  const distinct = [...new Set(weights.filter((w) => w > 0).map((w) => Math.round(w * 100) / 100))].sort((a, b) => a - b)
  if (distinct.length < 3) return undefined
  const counts = new Map<number, number>()
  for (let i = 1; i < distinct.length; i++) {
    const diff = Math.round((distinct[i] - distinct[i - 1]) * 100) / 100
    // Große Sprünge (Aufwärmsätze, neue Übungsvariante) sagen nichts über die Schrittweite.
    if (diff > 10) continue
    const step = nearestStep(diff)
    counts.set(step, (counts.get(step) ?? 0) + 1)
  }
  let best: number | undefined
  let bestCount = 0
  for (const [step, count] of counts) if (count > bestCount || (count === bestCount && best !== undefined && step < best)) [best, bestCount] = [step, count]
  return bestCount >= 2 ? best : undefined
}

export function stepFromName(name: string): number {
  const n = name.toLowerCase()
  if (/kurzhantel|\bkh\b|dumbbell/.test(n)) return 2
  if (/maschine|kabel|cable|latzug|beinpresse|butterfly|turm|seilzug|smith/.test(n)) return 5
  return 2.5
}

export function smartWeightStep(name: string, historyWeights: number[], override?: number): { step: number; source: 'eigen' | 'gelernt' | 'automatisch' } {
  if (override) return { step: override, source: 'eigen' }
  const learned = learnedStep(historyWeights)
  if (learned) return { step: learned, source: 'gelernt' }
  return { step: stepFromName(name), source: 'automatisch' }
}
