import type { TrainingPlan, WorkoutLog } from '../models/types'

/**
 * Welcher Trainingstag heute dran ist: der nach dem zuletzt absolvierten (in Plan-Reihenfolge,
 * rundum). Ohne Verlauf der erste. Nur Tage mit Übungen zählen.
 */
export function nextTrainingPlan(plans: TrainingPlan[], planIdsWithExercises: Set<string>, logs: WorkoutLog[], today: string): TrainingPlan | undefined {
  const usable = [...plans].sort((a, b) => a.order - b.order).filter((p) => planIdsWithExercises.has(p.id))
  if (usable.length === 0) return undefined
  const last = [...logs]
    .filter((l) => l.date < today && l.trainingPlanId)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  const index = last ? usable.findIndex((p) => p.id === last.trainingPlanId) : -1
  return usable[(index + 1) % usable.length]
}

export type NextStep = { kind: 'weight' | 'protein' | 'kcal' | 'water' | 'done'; text: string }

/** Der eine Hinweis, was heute als Nächstes sinnvoll ist - in dieser Reihenfolge. */
export function nextStep(input: {
  weighedToday: boolean
  proteinLeft: number
  kcalLeft: number
  waterLeftMl: number
  hour: number
}): NextStep {
  if (!input.weighedToday && input.hour < 12) return { kind: 'weight', text: 'Heute noch nicht gewogen – am besten gleich morgens.' }
  if (input.proteinLeft > 20) return { kind: 'protein', text: `Noch ${Math.round(input.proteinLeft)} g Protein offen.` }
  if (input.kcalLeft > 300) return { kind: 'kcal', text: `Noch ${Math.round(input.kcalLeft).toLocaleString('de-DE')} kcal Luft für heute.` }
  if (input.waterLeftMl > 0) {
    const l = (input.waterLeftMl / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })
    return { kind: 'water', text: `Noch ${l} l Wasser bis zum Ziel.` }
  }
  if (!input.weighedToday) return { kind: 'weight', text: 'Heute noch nicht gewogen.' }
  return { kind: 'done', text: 'Alles erledigt für heute – stark!' }
}
