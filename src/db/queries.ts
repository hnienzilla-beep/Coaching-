import { db } from './db'
import type { Athlete, DailyEntry, NutritionLog, PlanMeal, WorkoutLog } from '../models/types'

export const ACCENT_COLORS = ['#a3e635', '#22d3ee', '#f472b6', '#fb923c', '#c084fc', '#facc15']

export function pickAccentColor(existingCount: number): string {
  return ACCENT_COLORS[existingCount % ACCENT_COLORS.length]
}

export async function createAthlete(partial: Omit<Athlete, 'id' | 'accentColor'>): Promise<Athlete> {
  const count = await db.athletes.count()
  const athlete: Athlete = {
    id: crypto.randomUUID(),
    accentColor: pickAccentColor(count),
    ...partial,
  }
  await db.athletes.add(athlete)
  await createDefaultPlans(athlete.id)
  await createDefaultSupplementPlans(athlete.id)
  await createDefaultTrainingPlans(athlete.id)
  return athlete
}

async function createDefaultPhases(
  add: (phase: { id: string; athleteId: string; phaseName: string; order: number }) => Promise<unknown>,
  athleteId: string,
  names: string[] = ['Phase 1', 'Phase 2', 'Phase 3'],
): Promise<void> {
  for (let i = 0; i < names.length; i++) {
    await add({ id: crypto.randomUUID(), athleteId, phaseName: names[i], order: i })
  }
}

export async function createDefaultPlans(athleteId: string): Promise<void> {
  await createDefaultPhases((plan) => db.nutritionPlans.add(plan), athleteId)
}

export async function createDefaultSupplementPlans(athleteId: string): Promise<void> {
  await createDefaultPhases((plan) => db.supplementPlans.add(plan), athleteId)
}

export async function createDefaultTrainingPlans(athleteId: string): Promise<void> {
  await createDefaultPhases((plan) => db.trainingPlans.add(plan), athleteId, ['Tag A', 'Tag B', 'Tag C'])
}

export async function deleteAthlete(athleteId: string): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.athletes,
      db.dailyEntries,
      db.nutritionPlans,
      db.planMeals,
      db.progressPhotos,
      db.supplementPlans,
      db.supplementPlanItems,
      db.trainingPlans,
      db.trainingPlanExercises,
      db.workoutLogs,
      db.workoutLogExercises,
      db.workoutSets,
      db.nutritionLogs,
      db.nutritionLogItems,
    ],
    async () => {
      const plans = await db.nutritionPlans.where('athleteId').equals(athleteId).toArray()
      for (const plan of plans) {
        await db.planMeals.where('planId').equals(plan.id).delete()
      }
      await db.nutritionPlans.where('athleteId').equals(athleteId).delete()

      const supplementPlans = await db.supplementPlans.where('athleteId').equals(athleteId).toArray()
      for (const plan of supplementPlans) {
        await db.supplementPlanItems.where('planId').equals(plan.id).delete()
      }
      await db.supplementPlans.where('athleteId').equals(athleteId).delete()

      const trainingPlans = await db.trainingPlans.where('athleteId').equals(athleteId).toArray()
      for (const plan of trainingPlans) {
        await db.trainingPlanExercises.where('planId').equals(plan.id).delete()
      }
      await db.trainingPlans.where('athleteId').equals(athleteId).delete()

      const workoutLogs = await db.workoutLogs.where('athleteId').equals(athleteId).toArray()
      for (const log of workoutLogs) {
        const logExercises = await db.workoutLogExercises.where('workoutLogId').equals(log.id).toArray()
        for (const ex of logExercises) {
          await db.workoutSets.where('workoutLogExerciseId').equals(ex.id).delete()
        }
        await db.workoutLogExercises.where('workoutLogId').equals(log.id).delete()
      }
      await db.workoutLogs.where('athleteId').equals(athleteId).delete()

      const nutritionLogs = await db.nutritionLogs.where('athleteId').equals(athleteId).toArray()
      for (const log of nutritionLogs) {
        await db.nutritionLogItems.where('nutritionLogId').equals(log.id).delete()
      }
      await db.nutritionLogs.where('athleteId').equals(athleteId).delete()

      await db.dailyEntries.where('athleteId').equals(athleteId).delete()
      await db.progressPhotos.where('athleteId').equals(athleteId).delete()
      await db.athletes.delete(athleteId)
    },
  )
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return isoDate(d)
}

// Baut die vollständige Tagesreihe ab Startdatum bis heute (oder bis zum letzten Eintrag,
// je nachdem was später ist) - analog zur automatisch fortlaufenden Datumsspalte im Excel.
export async function getTrackingSeries(athleteId: string, startDate: string): Promise<DailyEntry[]> {
  const entries = await db.dailyEntries.where('athleteId').equals(athleteId).toArray()
  const byDate = new Map(entries.map((e) => [e.date, e]))

  const today = isoDate(new Date())
  const lastEntryDate = entries.reduce((max, e) => (e.date > max ? e.date : max), startDate)
  const endDate = lastEntryDate > today ? lastEntryDate : today

  const series: DailyEntry[] = []
  let cursor = startDate
  while (cursor <= endDate) {
    const existing = byDate.get(cursor)
    series.push(existing ?? { id: crypto.randomUUID(), athleteId, date: cursor })
    cursor = addDays(cursor, 1)
  }
  return series
}

export async function upsertDailyEntry(entry: DailyEntry): Promise<void> {
  const existing = await db.dailyEntries.where('[athleteId+date]').equals([entry.athleteId, entry.date]).first()
  if (existing) {
    await db.dailyEntries.update(existing.id, { ...entry, id: existing.id })
  } else {
    await db.dailyEntries.add(entry)
  }
}

// Übernimmt die Tagessumme aus dem Ernährungslog (abgehakte Einträge) in die
// Tracking-Felder, ohne andere Felder (Gewicht, Körpermaße, Notizen) anzutasten.
export async function syncNutritionTotalsToDailyEntry(
  athleteId: string,
  date: string,
  totals: { calories: number; protein: number; carbs: number; fat: number },
): Promise<void> {
  const existing = await db.dailyEntries.where('[athleteId+date]').equals([athleteId, date]).first()
  const rounded = {
    calories: Math.round(totals.calories),
    protein: Math.round(totals.protein),
    carbs: Math.round(totals.carbs),
    fat: Math.round(totals.fat),
  }
  if (existing) {
    await db.dailyEntries.update(existing.id, rounded)
  } else {
    await db.dailyEntries.add({ id: crypto.randomUUID(), athleteId, date, ...rounded })
  }
}

// Übernimmt den aus dem FFMI berechneten KFA-Wert in den heutigen Tracking-Eintrag,
// ohne andere Felder (Gewicht, Kalorien, Makros, Notizen) anzutasten.
export async function syncBodyFatToDailyEntry(athleteId: string, date: string, bodyFatPct: number): Promise<void> {
  const existing = await db.dailyEntries.where('[athleteId+date]').equals([athleteId, date]).first()
  const rounded = Math.round(bodyFatPct * 10) / 10
  if (existing) {
    await db.dailyEntries.update(existing.id, { bodyFatPct: rounded })
  } else {
    await db.dailyEntries.add({ id: crypto.randomUUID(), athleteId, date, bodyFatPct: rounded })
  }
}

export async function addPlanMeal(meal: PlanMeal): Promise<void> {
  await db.planMeals.add(meal)
}

export async function removePlanMeal(id: string): Promise<void> {
  await db.planMeals.delete(id)
}

export async function getOrCreateWorkoutLog(athleteId: string, date: string): Promise<WorkoutLog> {
  const existing = await db.workoutLogs.where('[athleteId+date]').equals([athleteId, date]).first()
  if (existing) return existing
  const log: WorkoutLog = { id: crypto.randomUUID(), athleteId, date }
  await db.workoutLogs.add(log)
  return log
}

export async function getOrCreateNutritionLog(athleteId: string, date: string): Promise<NutritionLog> {
  const existing = await db.nutritionLogs.where('[athleteId+date]').equals([athleteId, date]).first()
  if (existing) return existing
  const log: NutritionLog = { id: crypto.randomUUID(), athleteId, date }
  await db.nutritionLogs.add(log)
  return log
}
