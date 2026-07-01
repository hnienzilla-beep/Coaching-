import Dexie, { type EntityTable } from 'dexie'
import type {
  Athlete,
  DailyEntry,
  Exercise,
  FoodItem,
  NutritionPlan,
  PlanMeal,
  ProgressPhoto,
  Supplement,
  SupplementPlan,
  SupplementPlanItem,
  TrainingPlan,
  TrainingPlanExercise,
  WorkoutLog,
  WorkoutLogExercise,
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
