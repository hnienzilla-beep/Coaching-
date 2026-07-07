import { db } from './db'
import type {
  Athlete,
  DailyEntry,
  FoodItem,
  MealType,
  MuscleGroup,
  NutritionLog,
  PlanMeal,
  WorkoutLog,
  WorkoutSet,
} from '../models/types'

export const ACCENT_COLORS = [
  '#a3e635', // lime
  '#22d3ee', // cyan
  '#f472b6', // pink
  '#fb923c', // orange
  '#c084fc', // purple
  '#facc15', // yellow
  '#38bdf8', // sky
  '#34d399', // emerald
  '#fb7185', // rose
  '#818cf8', // indigo
  '#2dd4bf', // teal
  '#e879f9', // fuchsia
]

export function pickAccentColor(existingCount: number): string {
  return ACCENT_COLORS[existingCount % ACCENT_COLORS.length]
}

export async function createAthlete(
  partial: Omit<Athlete, 'id' | 'accentColor' | 'order'> & { accentColor?: string },
): Promise<Athlete> {
  const count = await db.athletes.count()
  const { accentColor, ...rest } = partial
  const athlete: Athlete = {
    id: crypto.randomUUID(),
    accentColor: accentColor ?? pickAccentColor(count),
    order: count,
    ...rest,
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

// In eine Transaktion gewrappt, da mehrere Aufrufer (manuelle Eingabe, Ernährungslog-Sync,
// FFMI/KFA-Sync) für denselben [athleteId+date]-Schlüssel nebenläufig lesen+schreiben können -
// ohne Transaktion könnten zwei "kein Eintrag vorhanden"-Lesungen jeweils einen eigenen,
// doppelten Eintrag anlegen.
export async function upsertDailyEntry(entry: DailyEntry): Promise<void> {
  await db.transaction('rw', db.dailyEntries, async () => {
    const existing = await db.dailyEntries.where('[athleteId+date]').equals([entry.athleteId, entry.date]).first()
    if (existing) {
      await db.dailyEntries.update(existing.id, { ...entry, id: existing.id })
    } else {
      await db.dailyEntries.add(entry)
    }
  })
}

// Übernimmt die Tagessumme aus dem Ernährungslog (abgehakte Einträge) in die
// Tracking-Felder, ohne andere Felder (Gewicht, Körpermaße, Notizen) anzutasten.
export async function syncNutritionTotalsToDailyEntry(
  athleteId: string,
  date: string,
  totals: { calories: number; protein: number; carbs: number; fat: number },
): Promise<void> {
  const rounded = {
    calories: Math.round(totals.calories),
    protein: Math.round(totals.protein),
    carbs: Math.round(totals.carbs),
    fat: Math.round(totals.fat),
  }
  await db.transaction('rw', db.dailyEntries, async () => {
    const existing = await db.dailyEntries.where('[athleteId+date]').equals([athleteId, date]).first()
    if (existing) {
      await db.dailyEntries.update(existing.id, rounded)
    } else {
      await db.dailyEntries.add({ id: crypto.randomUUID(), athleteId, date, ...rounded })
    }
  })
}

// Übernimmt den aus dem FFMI berechneten KFA-Wert in den Tracking-Eintrag des jeweiligen
// Tages, ohne andere Felder (Gewicht, Kalorien, Makros, Notizen) anzutasten.
export async function syncBodyFatToDailyEntry(athleteId: string, date: string, bodyFatPct: number): Promise<void> {
  const rounded = Math.round(bodyFatPct * 10) / 10
  await db.transaction('rw', db.dailyEntries, async () => {
    const existing = await db.dailyEntries.where('[athleteId+date]').equals([athleteId, date]).first()
    if (existing) {
      await db.dailyEntries.update(existing.id, { bodyFatPct: rounded })
    } else {
      await db.dailyEntries.add({ id: crypto.randomUUID(), athleteId, date, bodyFatPct: rounded })
    }
  })
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

// Sucht rückwärts-chronologisch die letzte Trainingseinheit vor beforeDate, in der die
// gegebene Übung vorkam, und liefert deren Sätze als Referenz für die aktuelle Session.
export async function getLastExercisePerformance(
  athleteId: string,
  exerciseId: string,
  beforeDate: string,
): Promise<{ date: string; sets: WorkoutSet[] } | undefined> {
  const logs = await db.workoutLogs.where('athleteId').equals(athleteId).reverse().sortBy('date')
  for (const log of logs) {
    if (log.date >= beforeDate) continue
    const logExercise = await db.workoutLogExercises
      .where('workoutLogId')
      .equals(log.id)
      .and((e) => e.exerciseId === exerciseId)
      .first()
    if (logExercise) {
      const sets = await db.workoutSets.where('workoutLogExerciseId').equals(logExercise.id).sortBy('setNumber')
      return { date: log.date, sets }
    }
  }
  return undefined
}

interface ProgressExport {
  kind: 'progressExport'
  version: 1
  athleteName: string
  exportedAt: string
  dailyEntries: Omit<DailyEntry, 'id' | 'athleteId'>[]
  workoutDays: {
    date: string
    notes?: string
    exercises: {
      exerciseName: string
      exerciseFallback?: { muscleGroup: MuscleGroup }
      notes?: string
      sets: { setNumber: number; reps?: number; weightKg?: number; rpe?: number; done?: boolean }[]
    }[]
  }[]
  nutritionDays: {
    date: string
    notes?: string
    items: {
      mealType: MealType
      foodName: string
      foodMacros?: Omit<FoodItem, 'id' | 'name'>
      grams: number
      order: number
      done?: boolean
    }[]
  }[]
}

// Exportiert die letzten 7 Tage aus Tracking, Trainingslog und Ernährungslog eines
// Athleten, z.B. damit ein Athlet seinen Fortschritt kalenderwöchentlich an den Coach
// schicken kann. Übungen/Lebensmittel werden über den Namen statt der ID referenziert
// (mit Fallback-Werten), da Coach- und Athleten-Gerät getrennte Datenbanken mit
// zufälligen IDs sind - analog zu importTrainingPlan/importNutritionPlan in db.ts.
export async function exportProgress(athleteId: string): Promise<string> {
  const athlete = await db.athletes.get(athleteId)
  const since = addDays(isoDate(new Date()), -6)

  const dailyEntries = (await db.dailyEntries.where('athleteId').equals(athleteId).toArray())
    .filter((e) => e.date >= since)
    .map(({ id: _id, athleteId: _athleteId, ...rest }) => rest)

  const workoutLogsRaw = (await db.workoutLogs.where('athleteId').equals(athleteId).toArray()).filter((l) => l.date >= since)
  const workoutDays: ProgressExport['workoutDays'] = []
  for (const log of workoutLogsRaw) {
    const logExercises = await db.workoutLogExercises.where('workoutLogId').equals(log.id).toArray()
    const exercises: ProgressExport['workoutDays'][number]['exercises'] = []
    for (const le of logExercises) {
      const exercise = await db.exercises.get(le.exerciseId)
      const sets = await db.workoutSets.where('workoutLogExerciseId').equals(le.id).sortBy('setNumber')
      exercises.push({
        exerciseName: exercise?.name ?? 'Unbekannte Übung',
        exerciseFallback: exercise ? { muscleGroup: exercise.muscleGroup } : undefined,
        notes: le.notes,
        sets: sets.map(({ setNumber, reps, weightKg, rpe, done }) => ({ setNumber, reps, weightKg, rpe, done })),
      })
    }
    workoutDays.push({ date: log.date, notes: log.notes, exercises })
  }

  const nutritionLogsRaw = (await db.nutritionLogs.where('athleteId').equals(athleteId).toArray()).filter((l) => l.date >= since)
  const nutritionDays: ProgressExport['nutritionDays'] = []
  for (const log of nutritionLogsRaw) {
    const logItems = await db.nutritionLogItems.where('nutritionLogId').equals(log.id).sortBy('order')
    const items: ProgressExport['nutritionDays'][number]['items'] = []
    for (const it of logItems) {
      const food = await db.foodItems.get(it.foodItemId)
      items.push({
        mealType: it.mealType,
        foodName: food?.name ?? 'Unbekanntes Lebensmittel',
        foodMacros: food ? { kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat } : undefined,
        grams: it.grams,
        order: it.order,
        done: it.done,
      })
    }
    nutritionDays.push({ date: log.date, notes: log.notes, items })
  }

  const result: ProgressExport = {
    kind: 'progressExport',
    version: 1,
    athleteName: athlete?.name ?? '',
    exportedAt: new Date().toISOString(),
    dailyEntries,
    workoutDays,
    nutritionDays,
  }
  return JSON.stringify(result)
}

// Importiert eine per exportProgress erzeugte Datei für den angegebenen (bereits
// bestehenden) Athleten. Tage werden über [athleteId+date] gemerged (upsertDailyEntry/
// getOrCreateWorkoutLog/getOrCreateNutritionLog) statt per bulkPut dupliziert - Kind-Zeilen
// (Übungen+Sätze, Lebensmittel-Einträge) werden je betroffenem Tag komplett ersetzt, daher
// ist wiederholtes Importieren derselben Datei idempotent.
export async function importProgress(json: string, athleteId: string): Promise<void> {
  const template = JSON.parse(json) as ProgressExport
  if (template.kind !== 'progressExport') throw new Error('Ungültige Datei (kein Fortschritt-Export)')

  await db.transaction(
    'rw',
    [db.dailyEntries, db.workoutLogs, db.workoutLogExercises, db.workoutSets, db.exercises, db.nutritionLogs, db.nutritionLogItems, db.foodItems],
    async () => {
      for (const entry of template.dailyEntries) {
        await upsertDailyEntry({ id: crypto.randomUUID(), athleteId, ...entry })
      }

      for (const day of template.workoutDays) {
        const log = await getOrCreateWorkoutLog(athleteId, day.date)
        if (day.notes !== undefined) await db.workoutLogs.update(log.id, { notes: day.notes })
        const oldExercises = await db.workoutLogExercises.where('workoutLogId').equals(log.id).toArray()
        for (const oldEx of oldExercises) {
          await db.workoutSets.where('workoutLogExerciseId').equals(oldEx.id).delete()
        }
        await db.workoutLogExercises.where('workoutLogId').equals(log.id).delete()
        for (const [i, ex] of day.exercises.entries()) {
          let exercise = await db.exercises.where('name').equals(ex.exerciseName).first()
          if (!exercise && ex.exerciseFallback) {
            exercise = { id: crypto.randomUUID(), name: ex.exerciseName, ...ex.exerciseFallback }
            await db.exercises.add(exercise)
          }
          if (!exercise) continue
          const logExerciseId = crypto.randomUUID()
          await db.workoutLogExercises.add({ id: logExerciseId, workoutLogId: log.id, exerciseId: exercise.id, order: i, notes: ex.notes })
          for (const s of ex.sets) {
            await db.workoutSets.add({ id: crypto.randomUUID(), workoutLogExerciseId: logExerciseId, ...s })
          }
        }
      }

      for (const day of template.nutritionDays) {
        const log = await getOrCreateNutritionLog(athleteId, day.date)
        if (day.notes !== undefined) await db.nutritionLogs.update(log.id, { notes: day.notes })
        await db.nutritionLogItems.where('nutritionLogId').equals(log.id).delete()
        for (const item of day.items) {
          let food = await db.foodItems.where('name').equals(item.foodName).first()
          if (!food && item.foodMacros) {
            food = { id: crypto.randomUUID(), name: item.foodName, ...item.foodMacros }
            await db.foodItems.add(food)
          }
          if (!food) continue
          await db.nutritionLogItems.add({
            id: crypto.randomUUID(),
            nutritionLogId: log.id,
            mealType: item.mealType,
            foodItemId: food.id,
            grams: item.grams,
            order: item.order,
            done: item.done,
          })
        }
      }
    },
  )
}
