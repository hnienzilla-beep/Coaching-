import type { Gender } from '../models/types'
import { addDays } from '../db/queries'

// Portiert aus dem "Daten"-Blatt der Excel-Vorlage
export const ACTIVITY_LEVELS: { label: string; factor: number }[] = [
  { label: 'Wenig aktiv (Bürojob)', factor: 1.2 },
  { label: 'Leicht aktiv (1-3x/Woche)', factor: 1.375 },
  { label: 'Mäßig aktiv (3-5x/Woche)', factor: 1.55 },
  { label: 'Sehr aktiv (6-7x/Woche)', factor: 1.725 },
  { label: 'Extrem aktiv (2x/Tag)', factor: 1.9 },
]

export const GOALS: { label: string; adjustment: number }[] = [
  { label: 'Aggressive Diät', adjustment: -0.25 },
  { label: 'Diät / Fettabbau', adjustment: -0.2 },
  { label: 'Leichte Diät', adjustment: -0.1 },
  { label: 'Erhaltung', adjustment: 0 },
  { label: 'Lean Bulk', adjustment: 0.1 },
  { label: 'Aufbau', adjustment: 0.2 },
]

export interface CalculatorInput {
  gender: Gender
  age: number
  heightCm: number
  weightKg: number
  activityLevel: string
  goal: string
  proteinPerKg: number
  fatPerKg: number
  // Manuelles Kalorien-Defizit/-überschuss in kcal (negativ = Defizit, positiv = Überschuss).
  // Wenn gesetzt, hat es Vorrang vor der Ziel-Voreinstellung (GOALS-Prozentsatz).
  calorieAdjustmentKcal?: number
}

export interface CalculatorResult {
  bmr: number
  activityFactor: number
  tdee: number
  calorieAdjustmentKcal: number
  targetCalories: number
  proteinG: number
  fatG: number
  carbsG: number
  controlCalories: number
}

function round0(n: number): number {
  return Math.round(n)
}

// Mifflin-St-Jeor-Formel, identisch zur Excel-Formel in G4
export function calculate(input: CalculatorInput): CalculatorResult {
  const { gender, age, heightCm, weightKg, activityLevel, goal, proteinPerKg, fatPerKg, calorieAdjustmentKcal } = input

  const bmr =
    gender === 'Männlich'
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161

  const activityFactor = ACTIVITY_LEVELS.find((a) => a.label === activityLevel)?.factor ?? 0
  const tdee = round0(bmr * activityFactor)

  const goalPercentage = GOALS.find((g) => g.label === goal)?.adjustment ?? 0
  const effectiveAdjustment = calorieAdjustmentKcal ?? round0(tdee * goalPercentage)
  const targetCalories = round0(tdee + effectiveAdjustment)

  const proteinG = round0(weightKg * proteinPerKg)
  const fatG = round0(weightKg * fatPerKg)
  const carbsG = round0((targetCalories - proteinG * 4 - fatG * 9) / 4)
  const controlCalories = proteinG * 4 + carbsG * 4 + fatG * 9

  return {
    bmr: round0(bmr),
    activityFactor,
    tdee,
    calorieAdjustmentKcal: effectiveAdjustment,
    targetCalories,
    proteinG,
    fatG,
    carbsG,
    controlCalories,
  }
}

export function calculateBmi(weightKg: number, heightCm: number): number | undefined {
  if (!weightKg || !heightCm) return undefined
  const heightM = heightCm / 100
  return weightKg / (heightM * heightM)
}

// FFMI = fettfreie Masse / Größe(m)² -> umgekehrt lässt sich daraus der KFA schätzen,
// wenn FFMI, Gewicht und Größe bekannt sind: fettfreie Masse = FFMI * Größe(m)².
export function calculateBodyFatFromFfmi(ffmi: number, weightKg: number, heightCm: number): number | undefined {
  if (!ffmi || !weightKg || !heightCm) return undefined
  const heightM = heightCm / 100
  const leanMassKg = ffmi * heightM * heightM
  return (1 - leanMassKg / weightKg) * 100
}

export interface WeightPoint {
  date: string
  weightKg?: number
}

// Entspricht =AVERAGE(OFFSET(...,-MIN(7,ROW()-15),1)): Mittel der letzten (bis zu) 7 Tage
// mit vorhandenem Gewichtswert, endend am aktuellen Tag.
export function rollingAverage7(points: WeightPoint[], index: number): number | undefined {
  const windowStart = Math.max(0, index - 6)
  const values = points.slice(windowStart, index + 1).filter((p) => typeof p.weightKg === 'number')
  if (values.length === 0) return undefined
  const sum = values.reduce((acc, p) => acc + (p.weightKg as number), 0)
  return sum / values.length
}

// Entspricht der Δ-Woche-Formel: Differenz zum Gewicht vor genau 7 Tagen, erst ab Tag 8.
export function weeklyDelta(points: WeightPoint[], index: number): number | undefined {
  if (index < 7) return undefined
  const current = points[index]?.weightKg
  const previous = points[index - 7]?.weightKg
  if (typeof current !== 'number' || typeof previous !== 'number') return undefined
  return current - previous
}

function mondayOf(dateIso: string): string {
  const d = new Date(dateIso + 'T00:00:00Z')
  const day = d.getUTCDay() // 0=So, 1=Mo, ..., 6=Sa
  return addDays(dateIso, day === 0 ? -6 : 1 - day)
}

export interface CalendarWeekComparison {
  thisWeekAvg: number
  lastWeekAvg: number
  deltaKg: number
}

// Vergleicht den Gewichts-Durchschnitt der aktuellen ISO-Kalenderwoche (Montag-Sonntag,
// bis "today") mit dem Durchschnitt der vorigen vollständigen Kalenderwoche - im
// Unterschied zu weeklyDelta (rollierendes 7-Tage-Fenster, punktgenau) eine feste,
// kalendarische Wochengrenze.
export function calendarWeekWeightDelta(points: WeightPoint[], today: string): CalendarWeekComparison | undefined {
  const thisMonday = mondayOf(today)
  const lastMonday = addDays(thisMonday, -7)

  function avgInWeek(mondayIso: string): number | undefined {
    const end = addDays(mondayIso, 7)
    const values = points
      .filter((p) => p.date >= mondayIso && p.date < end && typeof p.weightKg === 'number')
      .map((p) => p.weightKg as number)
    if (values.length === 0) return undefined
    return values.reduce((a, b) => a + b, 0) / values.length
  }

  const thisWeekAvg = avgInWeek(thisMonday)
  const lastWeekAvg = avgInWeek(lastMonday)
  if (thisWeekAvg === undefined || lastWeekAvg === undefined) return undefined
  return { thisWeekAvg, lastWeekAvg, deltaKg: thisWeekAvg - lastWeekAvg }
}
