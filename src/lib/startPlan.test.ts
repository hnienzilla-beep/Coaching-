import { describe, expect, it } from 'vitest'
import { FOOD_SEED } from '../data/foodSeed'
import { EXERCISE_SEED } from '../data/exerciseSeed'
import {
  DEFAULT_ANSWERS,
  activityLevelFor,
  ageFromBirthDate,
  buildMealPlans,
  buildTrainingPlan,
  computeTargets,
  suggestTargetWeight,
  suggestedSplit,
  splitsFor,
  macroFactors,
  recommendSupplements,
  supplementNamesFor,
  targetWarning,
  type StartAnswers,
} from './startPlan'

const a = (patch: Partial<StartAnswers> = {}): StartAnswers => ({ ...DEFAULT_ANSWERS, firstName: 'Test', ...patch })
const exerciseNames = new Set(EXERCISE_SEED.map((e) => e.name))

describe('Körper & Ziel', () => {
  it('Alter aus Geburtsdatum', () => {
    expect(ageFromBirthDate('1995-10-01', '2026-09-29')).toBe(30)
    expect(ageFromBirthDate('1995-09-29', '2026-09-29')).toBe(31)
  })
  it('Aktivität aus Alltag und Trainingstagen', () => {
    expect(activityLevelFor({ activityMode: 'alltag', alltag: 'buero', steps: 'mittel', trainingDays: [] })).toMatch(/Wenig/)
    expect(activityLevelFor({ activityMode: 'schritte', alltag: 'buero', steps: 'viel', trainingDays: [0, 1, 2, 3, 4] })).toMatch(/Sehr|Mäßig/)
  })
  it('Zielgewicht-Vorschlag und Warnung', () => {
    const t = suggestTargetWeight(a({ weightKg: 95, heightCm: 180, bodyFatPct: 25 }))
    expect(t).toBeLessThan(95)
    expect(t).toBeGreaterThan(80)
    expect(targetWarning(a({ weightKg: 95, heightCm: 180 }), 55)).toMatch(/BMI/)
    expect(targetWarning(a({ weightKg: 95, heightCm: 180 }), 88)).toBeUndefined()
  })
  it('Ziele mit Zieldatum', () => {
    const t = computeTargets(a({ weightKg: 90, targetWeightKg: 85, tempo: 'normal' }), '2026-09-29')
    expect(t.result.targetCalories).toBeLessThan(t.result.tdee)
    expect(t.weeklyRateKg).toBe(-0.45)
    expect(t.targetDate! > '2026-11-01').toBe(true)
    expect(computeTargets(a({ goal: 'halten' }), '2026-09-29').targetWeightKg).toBeUndefined()
  })
})

describe('Trainingsplan', () => {
  it('Split-Vorschlag', () => {
    expect(suggestedSplit(3, 'fortgeschritten')).toBe('ganzkoerper')
    expect(suggestedSplit(4, 'fortgeschritten')).toBe('okuk')
    expect(suggestedSplit(6, 'erfahren')).toBe('ppl')
  })
  it('nur Übungen aus der Datenbank, Einheiten nach Split benannt', () => {
    const plan = buildTrainingPlan(a({ trainingDays: [0, 1, 3, 4], durationMin: 45, experience: 'fortgeschritten' }))
    expect(plan.map((d) => d.name)).toEqual(['Oberkörper A', 'Unterkörper A', 'Oberkörper B', 'Unterkörper B'])
    for (const d of plan) for (const e of d.exercises) expect(exerciseNames.has(e.name), e.name).toBe(true)
  })
  it('zuhause und mit Knieproblemen', () => {
    const plan = buildTrainingPlan(a({ location: 'zuhause', restrictions: ['knie'], cardio: true, cardioMinutes: 60, goal: 'aufbauen' }))
    const all = plan.flatMap((d) => d.exercises.map((e) => e.name))
    expect(all).not.toContain('Kniebeuge')
    expect(all).not.toContain('Goblet Squat')
    expect(all).not.toContain('Latzug')
    expect(all).toContain('Radfahren (Ergometer)')
  })
})

describe('Ernährungsplan', () => {
  const targets = { proteinG: 180, carbsG: 230, fatG: 75 }
  it('trifft die Makros ungefähr', () => {
    for (const day of buildMealPlans(a(), targets, FOOD_SEED)) {
      expect(Math.abs(day.totals.protein - 180)).toBeLessThan(25)
      expect(Math.abs(day.totals.carbs - 230)).toBeLessThan(35)
      expect(Math.abs(day.totals.fat - 75)).toBeLessThan(15)
    }
  })
  it('vegan trifft Fett und Kalorien ungefähr', () => {
    for (const day of buildMealPlans(a({ diet: 'vegan' }), { proteinG: 184, carbsG: 353, fatG: 64 }, FOOD_SEED)) {
      expect(day.totals.fat, day.name).toBeLessThan(80)
      expect(Math.abs(day.totals.protein - 184), day.name).toBeLessThan(30)
    }
  })
  it('vegan und ohne Gluten/Soja', () => {
    const days = buildMealPlans(a({ diet: 'vegan', allergens: ['gluten', 'soja'] }), targets, FOOD_SEED)
    const foods = days.flatMap((d) => d.items.map((i) => i.food))
    for (const bad of ['Skyr', 'Haferflocken', 'Tofu (natur)', 'Hähnchenbrust (gegart)', 'Whey Protein (Pulver)', 'Ei (ganz)']) expect(foods).not.toContain(bad)
    expect(foods.length).toBeGreaterThan(8)
  })
})

describe('Splits, Makros, Supplements', () => {
  it('mehr Splits je nach Tagen', () => {
    expect(splitsFor(4)).toEqual(expect.arrayContaining(['pushpullfb', 'torsolimbs']))
    expect(splitsFor(5)).toEqual(expect.arrayContaining(['pushpullfb', 'ppl', 'pplokuk', 'bro']))
    expect(suggestedSplit(5, 'fortgeschritten')).toBe('pushpullfb')
    expect(buildTrainingPlan(a({ trainingDays: [0, 1, 3, 4], split: 'torsolimbs' })).map((d) => d.name)).toEqual(['Torso', 'Limbs'])
    expect(buildTrainingPlan(a({ trainingDays: [0, 1, 2, 3, 4], split: 'pushpullfb' })).map((d) => d.name)).toEqual(['Push Fullbody', 'Pull Fullbody'])
    const bro = buildTrainingPlan(a({ trainingDays: [0, 1, 2, 3, 4], split: 'bro', durationMin: 60, experience: 'fortgeschritten' }))
    expect(bro.map((d) => d.name)).toEqual(['Brust', 'Rücken', 'Beine', 'Schultern', 'Arme'])
    for (const d of bro) for (const e of d.exercises) expect(exerciseNames.has(e.name), e.name).toBe(true)
  })
  it('High-Protein: 2,3 g Protein und 0,8 g Fett je kg', () => {
    expect(macroFactors('protein')).toEqual({ proteinPerKg: 2.3, fatPerKg: 0.8 })
  })
  it('Supplements aus den Antworten', () => {
    const vegan = recommendSupplements(a({ diet: 'vegan', gender: 'Weiblich', trainingDays: [0, 1, 2, 3] })).map((r) => r.name)
    expect(vegan).toEqual(expect.arrayContaining(['Kreatin Monohydrat', 'Vitamin D3', 'Omega-3 Algenöl (vegan)', 'Magnesium', 'Vitamin B-Komplex', 'Eisen']))
    expect(vegan).not.toContain('Whey Protein')
    expect(supplementNamesFor(a())).toContain('Whey Protein')
    expect(supplementNamesFor(a({ supplementsTouched: true, supplements: ['Zink'] }))).toEqual(['Zink'])
  })
})
