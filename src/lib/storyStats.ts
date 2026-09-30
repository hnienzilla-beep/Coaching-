import { addDays } from '../db/queries'
import type { DailyEntry } from '../models/types'
import { estimateOneRepMax } from './calculator'
import { forecastGoal, type Forecast } from './goalForecast'
import { setRecords, type Muscle, type MuscleSetRecord } from './muscles'

/*
 * Auswertung für die Wochen- bzw. Monats-Story. Reine Rechnung auf bereits geladenen Daten -
 * die Story-Ansicht holt die Daten und baut daraus die Folien.
 */

export type StorySet = { date: string; done?: boolean; reps?: number; weightKg?: number; exercise: string; muscle?: Muscle }
export type StoryWorkout = { date: string; durationMin?: number }
export type StoryFood = { date: string; name: string; grams: number }

export interface StoryInput {
  kind: 'week' | 'month'
  start: string
  end: string
  entries: DailyEntry[] // alle Tageseinträge des Athleten (für Vorperiode, Serien, Prognose)
  sets: StorySet[] // alle Sätze (für Rekorde auch vor dem Zeitraum)
  workouts: StoryWorkout[] // Einheiten im Zeitraum und davor
  foods: StoryFood[] // Log-Einträge im Zeitraum
  target: { kcal: number; protein: number; tolerance: number; waterMl: number }
  goal: { targetWeightKg?: number; losing: boolean }
  muscleTargets?: Partial<Record<Muscle, number>>
}

export interface Pr {
  exercise: string
  weightKg: number
  reps: number
  /** Geschätztes 1RM (Epley) des Rekordsatzes und der bisherigen Bestmarke. */
  oneRm: number
  previousOneRm: number
}

export interface PeriodStats {
  kind: 'week' | 'month'
  start: string
  end: string
  days: string[]
  kcalByDay: { date: string; kcal?: number }[]
  loggedDays: number
  avgKcal?: number
  avgProtein?: number
  avgCarbs?: number
  avgFat?: number
  daysOnTarget: number
  proteinDaysHit: number
  weekendExtraKcal?: number
  weights: { date: string; kg: number }[]
  avgWeight?: number
  weightDelta?: number
  avgWaterMl?: number
  waterDaysHit: number
  trainings: number
  setsDone: number
  volumeKg: number
  durationMin: number
  longestMin?: number
  muscleRecords: MuscleSetRecord[]
  missingMuscles: Muscle[]
  prs: Pr[]
  topFoods: { name: string; count: number; grams: number }[]
  streak: number
  bestStreak: number
  compare: { avgKcal?: number; avgWeight?: number; trainings: number; volumeKg: number }
  forecast?: Forecast
  measures: { label: string; latest: number; delta: number }[]
  topSet?: { exercise: string; weightKg: number; reps: number }
  bestDay?: { date: string; kcal: number }
  tips: string[]
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)

function daysBetween(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

function isWeekend(iso: string): boolean {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return day === 0 || day === 6
}

const MAJOR: Muscle[] = ['Brust', 'Latissimus', 'Quadrizeps', 'Beinbeuger', 'Po', 'Seitliche Schulter', 'Bizeps', 'Trizeps', 'Bauch']
const MEASURE_LABELS: [keyof DailyEntry, string][] = [
  ['waist', 'Bauch'],
  ['arm', 'Arm'],
  ['chest', 'Brust'],
  ['leg', 'Bein'],
]

/** Kernzahlen eines Zeitraums - ohne Vergleich, Tipps und Prognose (die braucht nur die Story). */
function core(input: StoryInput, start: string, end: string) {
  const days = daysBetween(start, end)
  const inRange = (d: string) => d >= start && d <= end
  const entries = input.entries.filter((e) => inRange(e.date))
  const byDate = new Map(entries.map((e) => [e.date, e]))
  const kcalDays = entries.filter((e) => (e.calories ?? 0) > 0)
  const weights = entries.filter((e) => e.weightKg !== undefined).map((e) => ({ date: e.date, kg: e.weightKg! })).sort((a, b) => a.date.localeCompare(b.date))
  const sets = input.sets.filter((s) => s.done && inRange(s.date))
  const workoutDays = new Set(sets.map((s) => s.date))
  const workouts = input.workouts.filter((w) => inRange(w.date))
  const durations = workouts.map((w) => w.durationMin).filter((m): m is number => m !== undefined && m > 0)
  return {
    days,
    byDate,
    kcalDays,
    weights,
    sets,
    avgKcal: avg(kcalDays.map((e) => e.calories!)),
    avgWeight: avg(weights.map((w) => w.kg)),
    trainings: workoutDays.size,
    volumeKg: Math.round(sets.reduce((a, s) => a + (s.reps ?? 0) * (s.weightKg ?? 0), 0)),
    durations,
  }
}

export function buildPeriodStats(input: StoryInput): PeriodStats {
  const { start, end, target } = input
  const c = core(input, start, end)
  const length = c.days.length
  const prev = core(input, addDays(start, -length), addDays(start, -1))

  // Rekorde nach geschätztem 1RM: bester Satz je Übung im Zeitraum, der alles davor übertrifft.
  // So zählen auch mehr Wiederholungen mit gleichem Gewicht als Rekord.
  const oneRm = (s: { weightKg?: number; reps?: number }) => (s.weightKg && s.reps ? estimateOneRepMax(s.weightKg, s.reps) : 0)
  const before = new Map<string, number>()
  for (const s of input.sets) if (s.done && s.date < start && oneRm(s) > 0) before.set(s.exercise, Math.max(before.get(s.exercise) ?? 0, oneRm(s)))
  const bestInPeriod = new Map<string, { weightKg: number; reps: number }>()
  const best1rmInPeriod = new Map<string, { weightKg: number; reps: number; oneRm: number }>()
  for (const s of c.sets) {
    if (!s.weightKg || !s.reps) continue
    const cur = bestInPeriod.get(s.exercise)
    if (!cur || s.weightKg > cur.weightKg || (s.weightKg === cur.weightKg && s.reps > cur.reps)) bestInPeriod.set(s.exercise, { weightKg: s.weightKg, reps: s.reps })
    const cur1 = best1rmInPeriod.get(s.exercise)
    if (!cur1 || oneRm(s) > cur1.oneRm) best1rmInPeriod.set(s.exercise, { weightKg: s.weightKg, reps: s.reps, oneRm: oneRm(s) })
  }
  const round1 = (n: number) => Math.round(n * 10) / 10
  const prs: Pr[] = [...best1rmInPeriod.entries()]
    .filter(([ex, b]) => before.has(ex) && round1(b.oneRm) > round1(before.get(ex)!))
    .map(([exercise, b]) => ({ exercise, weightKg: b.weightKg, reps: b.reps, oneRm: round1(b.oneRm), previousOneRm: round1(before.get(exercise)!) }))
    .sort((a, b) => b.oneRm / b.previousOneRm - a.oneRm / a.previousOneRm)

  let topSet: PeriodStats['topSet']
  for (const [exercise, b] of bestInPeriod) if (!topSet || b.weightKg > topSet.weightKg) topSet = { exercise, ...b }

  // Serien: geloggte Tage in Folge (bis zum Ende des Zeitraums) und die längste darin.
  const logged = new Set(input.entries.filter((e) => (e.calories ?? 0) > 0).map((e) => e.date))
  let streak = 0
  for (let d = end; logged.has(d); d = addDays(d, -1)) streak++
  let bestStreak = 0
  let run = 0
  for (const d of c.days) {
    run = logged.has(d) ? run + 1 : 0
    bestStreak = Math.max(bestStreak, run)
  }

  const muscleRecords: MuscleSetRecord[] = c.sets
    .filter((s) => s.muscle)
    .flatMap((s) => setRecords({ date: s.date, reps: s.reps, weightKg: s.weightKg, exercise: s.exercise }, s.muscle!))
  const trained = new Set(muscleRecords.map((r) => r.muscle))
  const missingMuscles = c.trainings > 0 ? MAJOR.filter((m) => !trained.has(m)) : []

  const foodCount = new Map<string, { count: number; grams: number }>()
  for (const f of input.foods.filter((f) => f.date >= start && f.date <= end)) {
    const cur = foodCount.get(f.name) ?? { count: 0, grams: 0 }
    foodCount.set(f.name, { count: cur.count + 1, grams: cur.grams + f.grams })
  }
  const topFoods = [...foodCount.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.grams - a.grams || b.count - a.count)
    .slice(0, 3)

  const measures = MEASURE_LABELS.flatMap(([key, label]) => {
    const points = input.entries.filter((e) => typeof e[key] === 'number' && e.date <= end).sort((a, b) => a.date.localeCompare(b.date))
    const inPeriod = points.filter((p) => p.date >= start)
    if (inPeriod.length === 0) return []
    const latest = inPeriod[inPeriod.length - 1][key] as number
    const baseline = (points.filter((p) => p.date < start).pop() ?? inPeriod[0])[key] as number
    return [{ label, latest, delta: Math.round((latest - baseline) * 10) / 10 }]
  })

  const water = c.days.map((d) => c.byDate.get(d)?.waterMl ?? 0).filter((ml) => ml > 0)
  const weekendKcal = avg(c.kcalDays.filter((e) => isWeekend(e.date)).map((e) => e.calories!))
  const weekdayKcal = avg(c.kcalDays.filter((e) => !isWeekend(e.date)).map((e) => e.calories!))

  const stats: PeriodStats = {
    kind: input.kind,
    start,
    end,
    days: c.days,
    kcalByDay: c.days.map((date) => ({ date, kcal: c.byDate.get(date)?.calories || undefined })),
    loggedDays: c.kcalDays.length,
    avgKcal: c.avgKcal,
    avgProtein: avg(c.kcalDays.map((e) => e.protein ?? 0)),
    avgCarbs: avg(c.kcalDays.map((e) => e.carbs ?? 0)),
    avgFat: avg(c.kcalDays.map((e) => e.fat ?? 0)),
    daysOnTarget: c.kcalDays.filter((e) => Math.abs(e.calories! - target.kcal) <= target.tolerance).length,
    proteinDaysHit: c.kcalDays.filter((e) => (e.protein ?? 0) >= target.protein - 15).length,
    weekendExtraKcal: weekendKcal !== undefined && weekdayKcal !== undefined ? weekendKcal - weekdayKcal : undefined,
    weights: c.weights,
    avgWeight: c.avgWeight,
    weightDelta: c.avgWeight !== undefined && prev.avgWeight !== undefined ? Math.round((c.avgWeight - prev.avgWeight) * 10) / 10 : undefined,
    avgWaterMl: avg(water),
    waterDaysHit: water.filter((ml) => ml >= target.waterMl).length,
    trainings: c.trainings,
    setsDone: c.sets.length,
    volumeKg: c.volumeKg,
    durationMin: Math.round(c.durations.reduce((a, b) => a + b, 0)),
    longestMin: c.durations.length ? Math.round(Math.max(...c.durations)) : undefined,
    muscleRecords,
    missingMuscles,
    prs,
    topFoods,
    streak,
    bestStreak,
    compare: {
      avgKcal: c.avgKcal !== undefined && prev.avgKcal !== undefined ? Math.round(c.avgKcal - prev.avgKcal) : undefined,
      avgWeight: c.avgWeight !== undefined && prev.avgWeight !== undefined ? Math.round((c.avgWeight - prev.avgWeight) * 10) / 10 : undefined,
      trainings: c.trainings - prev.trainings,
      volumeKg: c.volumeKg - prev.volumeKg,
    },
    forecast: input.goal.targetWeightKg !== undefined ? forecastGoal(input.entries, input.goal.targetWeightKg, end) : undefined,
    measures,
    topSet,
    bestDay: c.kcalDays
      .map((e) => ({ date: e.date, kcal: e.calories!, diff: Math.abs(e.calories! - target.kcal) }))
      .sort((a, b) => a.diff - b.diff)
      .map(({ date, kcal }) => ({ date, kcal }))[0],
    tips: [],
  }
  stats.tips = coachTips(stats, input)
  return stats
}

/** 1-3 Tipps im Coach-Stil, nach Wichtigkeit - aus dem, was die Zahlen hergeben. */
export function coachTips(s: PeriodStats, input: Pick<StoryInput, 'target' | 'goal' | 'muscleTargets'>): string[] {
  const { target, goal } = input
  const tips: string[] = []
  const expected = s.days.length
  if (s.loggedDays > 0 && s.loggedDays < expected * 0.7) {
    tips.push(`Nur ${s.loggedDays} von ${expected} Tagen erfasst – je lückenloser du loggst, desto genauer kann ich dich steuern.`)
  }
  if (s.avgProtein !== undefined && s.avgProtein < target.protein - 15) {
    tips.push(`Protein lag im Schnitt ${Math.round(target.protein - s.avgProtein)} g unter Ziel – plane eine feste Proteinquelle pro Mahlzeit oder einen Shake ein.`)
  }
  if (s.weekendExtraKcal !== undefined && s.weekendExtraKcal > 250) {
    tips.push(`Am Wochenende lagst du rund ${Math.round(s.weekendExtraKcal)} kcal über den Werktagen – plane Samstag und Sonntag vorab.`)
  } else if (s.avgKcal !== undefined && s.avgKcal > target.kcal + target.tolerance * 2) {
    tips.push(`Im Schnitt ${Math.round(s.avgKcal - target.kcal)} kcal über der Vorgabe – schau dir Snacks und Getränke genauer an.`)
  } else if (s.avgKcal !== undefined && s.avgKcal < target.kcal - 300) {
    tips.push(`Im Schnitt ${Math.round(target.kcal - s.avgKcal)} kcal unter der Vorgabe – zu wenig Energie bremst Training und Regeneration.`)
  }
  const perWeek = s.kind === 'week' ? s.trainings : s.trainings / (s.days.length / 7)
  if (perWeek < 2) tips.push(`Nur ${s.trainings} Training${s.trainings === 1 ? '' : 's'} – trag dir feste Termine ein, zwei bis vier pro Woche sind ideal.`)
  if (s.missingMuscles.length > 0 && s.missingMuscles.length <= 4) {
    tips.push(`${s.missingMuscles.slice(0, 3).join(', ')} kam${s.missingMuscles.length === 1 ? '' : 'en'} nicht vor – bau dafür eine Übung ein.`)
  }
  if (s.avgWaterMl !== undefined && s.avgWaterMl < target.waterMl * 0.8) {
    tips.push(`Ø ${(s.avgWaterMl / 1000).toFixed(1).replace('.', ',')} l Wasser – Ziel sind ${(target.waterMl / 1000).toFixed(1).replace('.', ',')} l. Stell dir eine Flasche sichtbar hin.`)
  }
  if (goal.losing && s.weightDelta !== undefined && s.weightDelta > 0.3) {
    tips.push(`Gewicht +${s.weightDelta.toFixed(1).replace('.', ',')} kg zur Vorperiode – prüfe, ob wirklich alles geloggt ist.`)
  }
  if (tips.length === 0) tips.push('Alles im grünen Bereich – halte genau diesen Kurs.')
  return tips.slice(0, 3)
}

/** Genug Daten für eine Story? Ohne geloggte Tage, Training und Gewicht bleibt sie aus. */
export function periodHasContent(s: PeriodStats): boolean {
  return s.loggedDays >= 2 || s.trainings > 0 || s.weights.length >= 2
}

