import { addDays } from '../db/queries'
import type { DailyEntry } from '../models/types'

export type StorySet = { done?: boolean; reps?: number; weightKg?: number; exercise: string }
export type StoryWorkout = { date: string; sets: StorySet[] }

export interface WeekStory {
  start: string
  end: string
  loggedDays: number
  avgKcal?: number
  avgProtein?: number
  daysOnTarget: number
  avgWeight?: number
  weightDelta?: number
  trainings: number
  setsDone: number
  volumeKg: number
  topSet?: { exercise: string; weightKg: number; reps: number }
  bestDay?: { date: string; kcal: number }
  avgWaterMl?: number
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)

/**
 * Wochenrückblick für die Woche ab `monday` (Mo-So): Ernährung, Gewicht (Ø gegen die Vorwoche),
 * Training und die Highlights. Reine Rechnung - die Story-Ansicht holt nur die Daten.
 */
export function buildWeekStory(
  monday: string,
  entries: DailyEntry[],
  workouts: StoryWorkout[],
  target: { kcal: number; tolerance: number },
): WeekStory {
  const end = addDays(monday, 6)
  const inWeek = (d: string) => d >= monday && d <= end
  const week = entries.filter((e) => inWeek(e.date))
  const kcalDays = week.filter((e) => (e.calories ?? 0) > 0)

  const prevMonday = addDays(monday, -7)
  const prevWeights = entries.filter((e) => e.date >= prevMonday && e.date < monday && e.weightKg !== undefined).map((e) => e.weightKg!)
  const weights = week.filter((e) => e.weightKg !== undefined).map((e) => e.weightKg!)
  const avgWeight = avg(weights)
  const prevAvg = avg(prevWeights)

  const weekWorkouts = workouts.filter((w) => inWeek(w.date))
  const doneSets = weekWorkouts.flatMap((w) => w.sets.filter((s) => s.done))
  let topSet: WeekStory['topSet']
  for (const s of doneSets) {
    if (s.weightKg === undefined || !s.reps) continue
    if (!topSet || s.weightKg > topSet.weightKg || (s.weightKg === topSet.weightKg && s.reps > topSet.reps)) {
      topSet = { exercise: s.exercise, weightKg: s.weightKg, reps: s.reps }
    }
  }

  const bestDay = kcalDays
    .map((e) => ({ date: e.date, kcal: e.calories!, diff: Math.abs(e.calories! - target.kcal) }))
    .sort((a, b) => a.diff - b.diff)[0]
  const water = week.filter((e) => (e.waterMl ?? 0) > 0).map((e) => e.waterMl!)

  return {
    start: monday,
    end,
    loggedDays: kcalDays.length,
    avgKcal: avg(kcalDays.map((e) => e.calories!)),
    avgProtein: avg(kcalDays.map((e) => e.protein ?? 0)),
    daysOnTarget: kcalDays.filter((e) => Math.abs(e.calories! - target.kcal) <= target.tolerance).length,
    avgWeight,
    weightDelta: avgWeight !== undefined && prevAvg !== undefined ? Math.round((avgWeight - prevAvg) * 10) / 10 : undefined,
    trainings: weekWorkouts.filter((w) => w.sets.some((s) => s.done)).length,
    setsDone: doneSets.length,
    volumeKg: Math.round(doneSets.reduce((a, s) => a + (s.reps ?? 0) * (s.weightKg ?? 0), 0)),
    topSet,
    bestDay: bestDay ? { date: bestDay.date, kcal: bestDay.kcal } : undefined,
    avgWaterMl: avg(water),
  }
}

/** Hat die Woche überhaupt etwas zu erzählen? */
export function storyHasContent(s: WeekStory): boolean {
  return s.loggedDays > 0 || s.trainings > 0 || s.avgWeight !== undefined
}
