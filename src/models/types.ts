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
  calorieAdjustmentKcal?: number // manuelles Kalorien-Defizit (negativ) / -überschuss (positiv), überschreibt die Ziel-Voreinstellung
  startDate: string // ISO date
  targetWeightKg?: number
  targetDate?: string // ISO date
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

export const SUPPLEMENT_TIMINGS = [
  'Morgens',
  'Mittags',
  'Abends',
  'Vor dem Training',
  'Nach dem Training',
  'Vor dem Schlafen',
] as const

export type SupplementTiming = (typeof SUPPLEMENT_TIMINGS)[number]

export interface Supplement {
  id: string
  name: string
  defaultDose: string // z.B. "5 g", "1 Kapsel"
  defaultTiming: SupplementTiming
  notes?: string
}

export interface SupplementPlan {
  id: string
  athleteId: string
  phaseName: string
  order: number
}

export interface SupplementPlanItem {
  id: string
  planId: string
  supplementId: string
  dose: string
  timing: SupplementTiming
  notes?: string
}

export const MUSCLE_GROUPS = ['Brust', 'Rücken', 'Beine', 'Schultern', 'Arme', 'Bauch', 'Ganzkörper', 'Sonstiges'] as const

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export interface Exercise {
  id: string
  name: string
  muscleGroup: MuscleGroup
}

export interface TrainingPlan {
  id: string
  athleteId: string
  phaseName: string
  order: number
}

export interface TrainingPlanExercise {
  id: string
  planId: string
  exerciseId: string
  order: number
  sets: number
  reps: string // z.B. "8-12" oder "10"
  targetWeightKg?: number
  notes?: string
}

export interface WorkoutLog {
  id: string
  athleteId: string
  date: string // ISO date, ein Eintrag pro Tag
  trainingPlanId?: string // welcher geplante Trainingstag absolviert wurde
  notes?: string
  completedAt?: string // ISO-Zeitstempel, gesetzt über den "Training beenden"-Button
}

export interface WorkoutLogExercise {
  id: string
  workoutLogId: string
  exerciseId: string
  notes?: string
}

export interface WorkoutSet {
  id: string
  workoutLogExerciseId: string
  setNumber: number
  reps?: number
  weightKg?: number
  done?: boolean // während des Trainings per Häkchen als erledigt markiert
}
