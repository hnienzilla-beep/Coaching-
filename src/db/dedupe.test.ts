import { describe, expect, it } from 'vitest'
import { dedupeTotal, planDedupe, type DedupeSnapshot } from './dedupe'
import type { Athlete, DailyEntry, Exercise, FoodItem, PlanMeal } from '../models/types'

function snapshot(partial: Partial<DedupeSnapshot>): DedupeSnapshot {
  return {
    athletes: [],
    dailyEntries: [],
    nutritionPlans: [],
    planMeals: [],
    supplementPlans: [],
    supplementPlanItems: [],
    trainingPlans: [],
    trainingPlanExercises: [],
    workoutLogs: [],
    workoutLogExercises: [],
    workoutSets: [],
    nutritionLogs: [],
    nutritionLogItems: [],
    foodItems: [],
    supplements: [],
    exercises: [],
    ...partial,
  }
}

function food(id: string, name: string, extra: Partial<FoodItem> = {}): FoodItem {
  return { id, name, kcal: 100, protein: 10, carbs: 10, fat: 1, ...extra }
}

function meal(id: string, planId: string, foodItemId: string, extra: Partial<PlanMeal> = {}): PlanMeal {
  return { id, planId, mealType: 'Frühstück', foodItemId, grams: 100, order: 0, ...extra }
}

function athlete(id: string, name: string, extra: Partial<Athlete> = {}): Athlete {
  return {
    id,
    name,
    accentColor: '#ffffff',
    order: 0,
    gender: 'Männlich',
    age: 30,
    heightCm: 180,
    weightKg: 85,
    activityLevel: 'Mäßig aktiv',
    goal: 'Abnehmen',
    proteinPerKg: 2,
    fatPerKg: 0.8,
    startDate: '2026-01-01',
    ...extra,
  }
}

function entry(id: string, athleteId: string, date: string, extra: Partial<DailyEntry> = {}): DailyEntry {
  return { id, athleteId, date, ...extra }
}

describe('planDedupe: Stammdaten', () => {
  it('führt Lebensmittel mit gleichem Namen zusammen und hängt die Verweise um', () => {
    const result = planDedupe(
      snapshot({
        foodItems: [food('a', 'Haferflocken'), food('b', ' haferflocken ')],
        planMeals: [meal('m1', 'p1', 'a'), meal('m2', 'p2', 'a'), meal('m3', 'p3', 'b')],
      }),
    )

    expect(result.report.foodItems).toBe(1)
    expect(result.removed.foodItems).toEqual(['b'])
    expect(result.updated.planMeals).toEqual([expect.objectContaining({ id: 'm3', foodItemId: 'a' })])
  })

  it('behält das Lebensmittel, auf das die meisten Pläne und Logs verweisen', () => {
    const result = planDedupe(
      snapshot({
        foodItems: [food('a', 'Reis'), food('b', 'Reis')],
        planMeals: [meal('m1', 'p1', 'b'), meal('m2', 'p2', 'b')],
      }),
    )

    expect(result.removed.foodItems).toEqual(['a'])
  })

  it('übernimmt Favorit und bestätigte Nährwerte in den überlebenden Eintrag', () => {
    const result = planDedupe(
      snapshot({
        // "a" ist der vielfach verwendete Eintrag und gewinnt - Favorit und der bestätigte
        // Nährwert-Stand des Doppelgängers ziehen mit um.
        foodItems: [food('a', 'Skyr', { unconfirmed: true }), food('b', 'Skyr ', { favorite: true })],
        planMeals: [meal('m1', 'p1', 'a'), meal('m2', 'p2', 'a')],
      }),
    )

    expect(result.removed.foodItems).toEqual(['b'])
    expect(result.updated.foodItems?.[0]).toMatchObject({ id: 'a', favorite: true, unconfirmed: undefined })
  })

  it('ersetzt "Sonstiges" durch die echte Muskelgruppe des Doppelgängers', () => {
    const exercises: Exercise[] = [
      { id: 'a', name: 'Bankdrücken', muscleGroup: 'Sonstiges' },
      { id: 'b', name: 'bankdrücken', muscleGroup: 'Brust' },
    ]
    const result = planDedupe(snapshot({ exercises }))

    // "b" hat die bessere Angabe und gewinnt deshalb - der Rang belohnt die echte Muskelgruppe.
    expect(result.removed.exercises).toEqual(['a'])
    expect(result.report.exercises).toBe(1)
  })

  it('lässt einen Datenbestand ohne Doppelgänger unangetastet', () => {
    const result = planDedupe(
      snapshot({
        foodItems: [food('a', 'Reis'), food('b', 'Quark')],
        planMeals: [meal('m1', 'p1', 'a'), meal('m2', 'p1', 'b', { order: 1 })],
      }),
    )

    expect(dedupeTotal(result.report)).toBe(0)
    expect(result.updated.planMeals).toBeUndefined()
  })
})

describe('planDedupe: Tage und Pläne', () => {
  it('verschmilzt mehrere Tracking-Einträge eines Tages und füllt leere Felder', () => {
    const result = planDedupe(
      snapshot({
        dailyEntries: [
          entry('a', 'ath', '2026-02-01', { weightKg: 84.2, notes: 'gut geschlafen' }),
          entry('b', 'ath', '2026-02-01', { weightKg: 84.2, calories: 2400 }),
        ],
      }),
    )

    expect(result.report.dailyEntries).toBe(1)
    expect(result.updated.dailyEntries?.[0]).toMatchObject({
      id: 'a',
      weightKg: 84.2,
      notes: 'gut geschlafen',
      calories: 2400,
    })
  })

  it('legt gleichnamige Plan-Phasen eines Athleten zusammen und behält jede Mahlzeit einmal', () => {
    const result = planDedupe(
      snapshot({
        nutritionPlans: [
          { id: 'p1', athleteId: 'ath', phaseName: 'Phase 1', order: 0 },
          { id: 'p2', athleteId: 'ath', phaseName: 'Phase 1', order: 1 },
        ],
        planMeals: [
          meal('m1', 'p1', 'f1'),
          meal('m2', 'p2', 'f1'),
          meal('m3', 'p2', 'f2', { mealType: 'Mittagessen' }),
        ],
        foodItems: [food('f1', 'Reis'), food('f2', 'Quark')],
      }),
    )

    // Die Phase mit den meisten Zeilen überlebt (p2), die Zeilen der anderen ziehen um.
    expect(result.report.nutritionPlans).toBe(1)
    expect(result.removed.nutritionPlans).toEqual(['p1'])
    // m2 ist danach die inhaltsgleiche Kopie von m1 und fällt weg.
    expect(result.report.planMeals).toBe(1)
    expect(result.removed.planMeals).toEqual(['m2'])
    expect(result.updated.planMeals?.find((m) => m.id === 'm1')).toMatchObject({ planId: 'p2', order: 0 })
    expect(result.updated.planMeals?.find((m) => m.id === 'm3')).toMatchObject({ planId: 'p2', order: 1 })
  })

  it('behält zwei Trainingsdurchgänge derselben Übung, wenn die Sätze verschieden sind', () => {
    const result = planDedupe(
      snapshot({
        workoutLogs: [{ id: 'w1', athleteId: 'ath', date: '2026-02-01' }],
        workoutLogExercises: [
          { id: 'e1', workoutLogId: 'w1', exerciseId: 'x1', order: 0 },
          { id: 'e2', workoutLogId: 'w1', exerciseId: 'x1', order: 1 },
        ],
        workoutSets: [
          { id: 's1', workoutLogExerciseId: 'e1', setNumber: 1, reps: 8, weightKg: 100 },
          { id: 's2', workoutLogExerciseId: 'e2', setNumber: 1, reps: 12, weightKg: 60 },
        ],
      }),
    )

    expect(dedupeTotal(result.report)).toBe(0)
  })

  it('entfernt eine Übungszeile samt Sätzen, wenn sie einer anderen komplett gleicht', () => {
    const result = planDedupe(
      snapshot({
        workoutLogs: [{ id: 'w1', athleteId: 'ath', date: '2026-02-01' }],
        workoutLogExercises: [
          { id: 'e1', workoutLogId: 'w1', exerciseId: 'x1', order: 0 },
          { id: 'e2', workoutLogId: 'w1', exerciseId: 'x1', order: 1 },
        ],
        workoutSets: [
          { id: 's1', workoutLogExerciseId: 'e1', setNumber: 1, reps: 8, weightKg: 100 },
          { id: 's2', workoutLogExerciseId: 'e2', setNumber: 1, reps: 8, weightKg: 100 },
        ],
      }),
    )

    expect(result.removed.workoutLogExercises).toEqual(['e2'])
    expect(result.removed.workoutSets).toEqual(['s2'])
  })
})

describe('planDedupe: Athleten', () => {
  it('lässt gleichnamige Athleten standardmäßig in Ruhe', () => {
    const result = planDedupe(
      snapshot({
        athletes: [athlete('a1', 'Leon'), athlete('a2', 'Leon', { order: 1 })],
        dailyEntries: [entry('d1', 'a1', '2026-02-01', { weightKg: 85 }), entry('d2', 'a2', '2026-02-01', { weightKg: 85 })],
      }),
    )

    expect(dedupeTotal(result.report)).toBe(0)
  })

  it('führt sie auf Wunsch samt Tagen zusammen', () => {
    const result = planDedupe(
      snapshot({
        athletes: [athlete('a1', 'Leon'), athlete('a2', 'leon ', { order: 1, targetWeightKg: 78 })],
        dailyEntries: [
          entry('d1', 'a1', '2026-02-01', { weightKg: 85 }),
          entry('d2', 'a2', '2026-02-01', { bodyFatPct: 18 }),
          entry('d3', 'a2', '2026-02-02', { weightKg: 84.8 }),
        ],
      }),
      { mergeAthletes: true },
    )

    // Der Athlet mit den meisten Tagen überlebt (a2), die Tage des anderen ziehen um.
    expect(result.mergedAthleteNames).toEqual(['Leon'])
    expect(result.report.athletes).toBe(1)
    expect(result.report.dailyEntries).toBe(1)
    expect(result.updated.dailyEntries?.find((d) => d.id === 'd1')).toMatchObject({
      athleteId: 'a2',
      weightKg: 85,
      bodyFatPct: 18,
    })
    expect(result.removed.dailyEntries).toEqual(['d2'])
    expect(result.updated.athletes?.[0]).toMatchObject({ id: 'a2', order: 0 })
  })
})
