import Dexie, { type EntityTable } from 'dexie'
import type {
  Athlete,
  DailyEntry,
  Exercise,
  FoodItem,
  MealType,
  MuscleGroup,
  NutritionPlan,
  PlanMeal,
  ProgressPhoto,
  Supplement,
  SupplementPlan,
  SupplementPlanItem,
  SupplementTiming,
  TrainingPlan,
  TrainingPlanExercise,
  WorkoutLog,
  WorkoutLogExercise,
  WorkoutSet,
} from '../models/types'
import { FOOD_SEED } from '../data/foodSeed'
import { SUPPLEMENT_SEED } from '../data/supplementSeed'
import { EXERCISE_SEED } from '../data/exerciseSeed'

export class CoachDB extends Dexie {
  athletes!: EntityTable<Athlete, 'id'>
  dailyEntries!: EntityTable<DailyEntry, 'id'>
  foodItems!: EntityTable<FoodItem, 'id'>
  nutritionPlans!: EntityTable<NutritionPlan, 'id'>
  planMeals!: EntityTable<PlanMeal, 'id'>
  progressPhotos!: EntityTable<ProgressPhoto, 'id'>
  supplements!: EntityTable<Supplement, 'id'>
  supplementPlans!: EntityTable<SupplementPlan, 'id'>
  supplementPlanItems!: EntityTable<SupplementPlanItem, 'id'>
  exercises!: EntityTable<Exercise, 'id'>
  trainingPlans!: EntityTable<TrainingPlan, 'id'>
  trainingPlanExercises!: EntityTable<TrainingPlanExercise, 'id'>
  workoutLogs!: EntityTable<WorkoutLog, 'id'>
  workoutLogExercises!: EntityTable<WorkoutLogExercise, 'id'>
  workoutSets!: EntityTable<WorkoutSet, 'id'>

  constructor() {
    super('bodybuilding-coach')
    this.version(1).stores({
      athletes: 'id, name',
      dailyEntries: 'id, athleteId, date, [athleteId+date]',
      foodItems: 'id, name',
      nutritionPlans: 'id, athleteId, order',
      planMeals: 'id, planId, mealType',
      progressPhotos: 'id, athleteId, date',
    })
    // Additive Erweiterungen - bestehende Stores bleiben unverändert erhalten.
    this.version(2).stores({
      supplements: 'id, name',
      supplementPlans: 'id, athleteId, order',
      supplementPlanItems: 'id, planId',
    })
    this.version(3).stores({
      exercises: 'id, name',
      trainingPlans: 'id, athleteId, order',
      trainingPlanExercises: 'id, planId',
      workoutLogs: 'id, athleteId, date, [athleteId+date]',
      workoutLogExercises: 'id, workoutLogId',
    })
    this.version(4).stores({
      workoutSets: 'id, workoutLogExerciseId',
    })
  }
}

export const db = new CoachDB()

export async function ensureFoodSeed(): Promise<void> {
  // Transaktion serialisiert parallele Aufrufe (z.B. React StrictMode-Doppelaufruf in Dev) -
  // ohne das würde ein zweiter Aufruf den Datenbestand ein zweites Mal einfügen.
  // Nachfüll-Logik statt reinem "leer?"-Check: ergänzt neu hinzugekommene FOOD_SEED-Einträge
  // auch bei Bestandsnutzern, ohne eigene/bearbeitete Lebensmittel anzufassen.
  await db.transaction('rw', db.foodItems, async () => {
    const existingNames = new Set(await db.foodItems.orderBy('name').keys())
    const missing = FOOD_SEED.filter((f) => !existingNames.has(f.name))
    if (missing.length === 0) return
    await db.foodItems.bulkAdd(
      missing.map((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        kcal: f.kcal,
        protein: f.protein,
        carbs: f.carbs,
        fat: f.fat,
      })),
    )
  })
}

export async function ensureSupplementSeed(): Promise<void> {
  await db.transaction('rw', db.supplements, async () => {
    const existingNames = new Set(await db.supplements.orderBy('name').keys())
    const missing = SUPPLEMENT_SEED.filter((s) => !existingNames.has(s.name))
    if (missing.length === 0) return
    await db.supplements.bulkAdd(
      missing.map((s) => ({
        id: crypto.randomUUID(),
        name: s.name,
        defaultDose: s.defaultDose,
        defaultTiming: s.defaultTiming,
        notes: s.notes,
      })),
    )
  })
}

export async function ensureExerciseSeed(): Promise<void> {
  await db.transaction('rw', db.exercises, async () => {
    const existingNames = new Set(await db.exercises.orderBy('name').keys())
    const missing = EXERCISE_SEED.filter((e) => !existingNames.has(e.name))
    if (missing.length === 0) return
    await db.exercises.bulkAdd(missing.map((e) => ({ id: crypto.randomUUID(), name: e.name, muscleGroup: e.muscleGroup })))
  })
}

// Bestandsdaten (vor Einführung von order) bekommen eine Reihenfolge nach Einfüge-Position.
export async function ensureTrainingPlanExerciseOrder(): Promise<void> {
  await db.transaction('rw', db.trainingPlanExercises, async () => {
    const all = await db.trainingPlanExercises.toArray()
    const missingOrder = all.filter((r) => r.order === undefined)
    if (missingOrder.length === 0) return
    const byPlan = new Map<string, typeof all>()
    for (const row of missingOrder) {
      const list = byPlan.get(row.planId) ?? []
      list.push(row)
      byPlan.set(row.planId, list)
    }
    for (const [, rows] of byPlan) {
      for (let i = 0; i < rows.length; i++) {
        await db.trainingPlanExercises.update(rows[i].id, { order: i })
      }
    }
  })
}

// Migriert alte WorkoutLogExercise-Datensätze (mit sets/reps/weightKg direkt am Datensatz)
// zu einzelnen WorkoutSet-Zeilen, damit bereits geloggte Trainingsdaten nicht verloren gehen.
export async function ensureWorkoutSetMigration(): Promise<void> {
  await db.transaction('rw', db.workoutLogExercises, db.workoutSets, async () => {
    const exercises = await db.workoutLogExercises.toArray()
    for (const ex of exercises) {
      const legacy = ex as unknown as { sets?: number; reps?: string; weightKg?: number }
      if (legacy.sets === undefined) continue
      const existingSets = await db.workoutSets.where('workoutLogExerciseId').equals(ex.id).count()
      if (existingSets === 0) {
        const setsToCreate = Math.max(1, legacy.sets)
        const repsNum = legacy.reps ? Number.parseInt(legacy.reps, 10) : undefined
        for (let i = 0; i < setsToCreate; i++) {
          await db.workoutSets.add({
            id: crypto.randomUUID(),
            workoutLogExerciseId: ex.id,
            setNumber: i + 1,
            reps: Number.isFinite(repsNum) ? repsNum : undefined,
            weightKg: legacy.weightKg,
          })
        }
      }
      await db.workoutLogExercises.update(ex.id, { sets: undefined, reps: undefined, weightKg: undefined } as never)
    }
  })
}

export async function exportAllData(): Promise<string> {
  const data: Record<string, unknown[]> = {}
  for (const table of db.tables) {
    if (table.name === 'progressPhotos') {
      const rows = await table.toArray()
      data[table.name] = await Promise.all(rows.map(async (r) => ({ ...r, blob: await blobToBase64(r.blob as Blob) })))
    } else {
      data[table.name] = await table.toArray()
    }
  }
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data })
}

export async function importAllData(json: string): Promise<void> {
  const parsed = JSON.parse(json) as { data: Record<string, Record<string, unknown>[]> }
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      const rows = parsed.data[table.name]
      if (!rows) continue
      if (table.name === 'progressPhotos') {
        const converted = await Promise.all(rows.map(async (r) => ({ ...r, blob: await base64ToBlob(r.blob as string) })))
        await table.bulkPut(converted)
      } else {
        await table.bulkPut(rows)
      }
    }
  })
}

// Plan-Vorlagen (einzelne Phase/Tag) als portables JSON exportieren/importieren.
// Referenzen (Lebensmittel/Supplemente/Übungen) werden über den Namen aufgelöst, da
// IDs pro Browser-Profil zufällig generiert werden und daher nicht athletenübergreifend
// gültig sind - Fallback-Daten im Export erlauben das Neuanlegen im Ziel-Datenbestand.

interface NutritionPlanTemplate {
  kind: 'nutritionPlan'
  version: 1
  phaseName: string
  items: { mealType: MealType; grams: number; foodName: string; foodMacros?: Omit<FoodItem, 'id' | 'name'> }[]
}

export async function exportNutritionPlan(planId: string): Promise<string> {
  const plan = await db.nutritionPlans.get(planId)
  if (!plan) throw new Error('Plan nicht gefunden')
  const meals = await db.planMeals.where('planId').equals(planId).toArray()
  const foods = await db.foodItems.bulkGet(meals.map((m) => m.foodItemId))
  const template: NutritionPlanTemplate = {
    kind: 'nutritionPlan',
    version: 1,
    phaseName: plan.phaseName,
    items: meals.map((m, i) => {
      const food = foods[i]
      return {
        mealType: m.mealType,
        grams: m.grams,
        foodName: food?.name ?? '?',
        foodMacros: food ? { kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat } : undefined,
      }
    }),
  }
  return JSON.stringify(template)
}

export async function importNutritionPlan(json: string, athleteId: string): Promise<string> {
  const template = JSON.parse(json) as NutritionPlanTemplate
  if (template.kind !== 'nutritionPlan') throw new Error('Ungültige Vorlagen-Datei (kein Ernährungsplan)')
  const planId = crypto.randomUUID()
  await db.transaction('rw', db.nutritionPlans, db.planMeals, db.foodItems, async () => {
    const order = await db.nutritionPlans.where('athleteId').equals(athleteId).count()
    await db.nutritionPlans.add({ id: planId, athleteId, phaseName: template.phaseName, order })
    for (const item of template.items) {
      let food = await db.foodItems.where('name').equals(item.foodName).first()
      if (!food && item.foodMacros) {
        food = { id: crypto.randomUUID(), name: item.foodName, ...item.foodMacros }
        await db.foodItems.add(food)
      }
      if (!food) continue
      await db.planMeals.add({ id: crypto.randomUUID(), planId, mealType: item.mealType, foodItemId: food.id, grams: item.grams })
    }
  })
  return planId
}

interface SupplementPlanTemplate {
  kind: 'supplementPlan'
  version: 1
  phaseName: string
  items: {
    supplementName: string
    supplementFallback?: Omit<Supplement, 'id' | 'name'>
    dose: string
    timing: SupplementTiming
    notes?: string
  }[]
}

export async function exportSupplementPlan(planId: string): Promise<string> {
  const plan = await db.supplementPlans.get(planId)
  if (!plan) throw new Error('Plan nicht gefunden')
  const items = await db.supplementPlanItems.where('planId').equals(planId).toArray()
  const supplements = await db.supplements.bulkGet(items.map((i) => i.supplementId))
  const template: SupplementPlanTemplate = {
    kind: 'supplementPlan',
    version: 1,
    phaseName: plan.phaseName,
    items: items.map((i, idx) => {
      const supplement = supplements[idx]
      return {
        supplementName: supplement?.name ?? '?',
        supplementFallback: supplement
          ? { defaultDose: supplement.defaultDose, defaultTiming: supplement.defaultTiming, notes: supplement.notes }
          : undefined,
        dose: i.dose,
        timing: i.timing,
        notes: i.notes,
      }
    }),
  }
  return JSON.stringify(template)
}

export async function importSupplementPlan(json: string, athleteId: string): Promise<string> {
  const template = JSON.parse(json) as SupplementPlanTemplate
  if (template.kind !== 'supplementPlan') throw new Error('Ungültige Vorlagen-Datei (kein Supplementplan)')
  const planId = crypto.randomUUID()
  await db.transaction('rw', db.supplementPlans, db.supplementPlanItems, db.supplements, async () => {
    const order = await db.supplementPlans.where('athleteId').equals(athleteId).count()
    await db.supplementPlans.add({ id: planId, athleteId, phaseName: template.phaseName, order })
    for (const item of template.items) {
      let supplement = await db.supplements.where('name').equals(item.supplementName).first()
      if (!supplement && item.supplementFallback) {
        supplement = { id: crypto.randomUUID(), name: item.supplementName, ...item.supplementFallback }
        await db.supplements.add(supplement)
      }
      if (!supplement) continue
      await db.supplementPlanItems.add({
        id: crypto.randomUUID(),
        planId,
        supplementId: supplement.id,
        dose: item.dose,
        timing: item.timing,
        notes: item.notes,
      })
    }
  })
  return planId
}

interface TrainingPlanTemplate {
  kind: 'trainingPlan'
  version: 1
  phaseName: string
  items: {
    exerciseName: string
    exerciseFallback?: { muscleGroup: MuscleGroup }
    order: number
    sets: number
    reps: string
    targetWeightKg?: number
    notes?: string
  }[]
}

export async function exportTrainingPlan(planId: string): Promise<string> {
  const plan = await db.trainingPlans.get(planId)
  if (!plan) throw new Error('Plan nicht gefunden')
  const rows = await db.trainingPlanExercises.where('planId').equals(planId).sortBy('order')
  const exercises = await db.exercises.bulkGet(rows.map((r) => r.exerciseId))
  const template: TrainingPlanTemplate = {
    kind: 'trainingPlan',
    version: 1,
    phaseName: plan.phaseName,
    items: rows.map((r, i) => {
      const exercise = exercises[i]
      return {
        exerciseName: exercise?.name ?? '?',
        exerciseFallback: exercise ? { muscleGroup: exercise.muscleGroup } : undefined,
        order: r.order,
        sets: r.sets,
        reps: r.reps,
        targetWeightKg: r.targetWeightKg,
        notes: r.notes,
      }
    }),
  }
  return JSON.stringify(template)
}

export async function importTrainingPlan(json: string, athleteId: string): Promise<string> {
  const template = JSON.parse(json) as TrainingPlanTemplate
  if (template.kind !== 'trainingPlan') throw new Error('Ungültige Vorlagen-Datei (kein Trainingsplan)')
  const planId = crypto.randomUUID()
  await db.transaction('rw', db.trainingPlans, db.trainingPlanExercises, db.exercises, async () => {
    const order = await db.trainingPlans.where('athleteId').equals(athleteId).count()
    await db.trainingPlans.add({ id: planId, athleteId, phaseName: template.phaseName, order })
    for (const item of template.items) {
      let exercise = await db.exercises.where('name').equals(item.exerciseName).first()
      if (!exercise && item.exerciseFallback) {
        exercise = { id: crypto.randomUUID(), name: item.exerciseName, ...item.exerciseFallback }
        await db.exercises.add(exercise)
      }
      if (!exercise) continue
      await db.trainingPlanExercises.add({
        id: crypto.randomUUID(),
        planId,
        exerciseId: exercise.id,
        order: item.order,
        sets: item.sets,
        reps: item.reps,
        targetWeightKg: item.targetWeightKg,
        notes: item.notes,
      })
    }
  })
  return planId
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function base64ToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}
