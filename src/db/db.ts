import Dexie, { type EntityTable } from 'dexie'
import type { Athlete, DailyEntry, FoodItem, NutritionPlan, PlanMeal, ProgressPhoto } from '../models/types'
import { FOOD_SEED } from '../data/foodSeed'

export class CoachDB extends Dexie {
  athletes!: EntityTable<Athlete, 'id'>
  dailyEntries!: EntityTable<DailyEntry, 'id'>
  foodItems!: EntityTable<FoodItem, 'id'>
  nutritionPlans!: EntityTable<NutritionPlan, 'id'>
  planMeals!: EntityTable<PlanMeal, 'id'>
  progressPhotos!: EntityTable<ProgressPhoto, 'id'>

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
  }
}

export const db = new CoachDB()

export async function ensureFoodSeed(): Promise<void> {
  // Transaktion serialisiert parallele Aufrufe (z.B. React StrictMode-Doppelaufruf in Dev) -
  // ohne das würde ein zweiter Aufruf den Datenbestand ein zweites Mal einfügen.
  await db.transaction('rw', db.foodItems, async () => {
    const count = await db.foodItems.count()
    if (count > 0) return
    await db.foodItems.bulkAdd(
      FOOD_SEED.map((f) => ({
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
