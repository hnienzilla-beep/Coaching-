export type Gender = 'Männlich' | 'Weiblich'

export interface Athlete {
  id: string
  name: string
  accentColor: string
  gender: Gender
  age: number
  heightCm: number
  weightKg: number
  activityLevel: string
  goal: string
  proteinPerKg: number
  fatPerKg: number
  startDate: string // ISO date
}

export interface DailyEntry {
  id: string
  athleteId: string
  date: string // ISO date, one entry per athlete per day
  weightKg?: number
  bodyFatPct?: number
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  waist?: number
  arm?: number
  chest?: number
  leg?: number
  notes?: string
}

export interface FoodItem {
  id: string
  name: string
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface NutritionPlan {
  id: string
  athleteId: string
  phaseName: string
  order: number
}

export const MEAL_TYPES = [
  'Frühstück',
  'Snack 1',
  'Mittagessen',
  'Snack 2',
  'Pre-Workout',
  'Post-Workout',
  'Abendessen',
] as const

export type MealType = (typeof MEAL_TYPES)[number]

export interface PlanMeal {
  id: string
  planId: string
  mealType: MealType
  foodItemId: string
  grams: number
}

export interface ProgressPhoto {
  id: string
  athleteId: string
  date: string // ISO date
  blob: Blob
}
