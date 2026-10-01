import type { DetailLevel } from './detailLevel'
import { db, ensureExerciseSeed } from '../db/db'
import { createAthlete, todayIso, upsertDailyEntry } from '../db/queries'
import { byName, nameKey } from './names'
import { setPrefs, type Prefs, type TabKey } from './prefs'
import { applyTheme, type Theme } from './theme'
import { buildMealPlans, buildTrainingWeek, computeTargets, supplementNamesFor, type StartAnswers } from './startPlan'
import type { Athlete, MealType } from '../models/types'

/** App-Einstellungen aus dem letzten Abschnitt von „Dein Start“. */
export interface StartAppChoices {
  weightUnit: Prefs['weightUnit']
  lengthUnit: Prefs['lengthUnit']
  volumeUnit: Prefs['volumeUnit']
  theme: Theme
  accentColor: string
  startTab: TabKey
  hiddenTabs: TabKey[]
  reminders: { weigh: boolean; food: boolean; water: boolean }
  /** Wie viel die App zeigt - ohne Auswahl nach Erfahrung (Einsteiger: Einfach). */
  detailLevel?: DetailLevel
}

/**
 * Legt aus den Antworten einen Athleten mit Zielen, Trainings-, Ernährungs- und
 * Supplementplan an. Die leeren Standard-Tage („Tag A/B/C“, „Phase 1-3“) werden dabei
 * durch die erstellten Pläne ersetzt.
 */
export async function createFromStart(a: StartAnswers, app: StartAppChoices): Promise<Athlete> {
  const today = todayIso()
  const t = computeTargets(a, today)

  const athlete = await createAthlete({
    ...athleteFields(a, t),
    startDate: today,
    accentColor: app.accentColor,
  })

  // Gewicht (und KFA) von heute als erster Eintrag - damit Verlauf und Prognose sofort starten.
  await upsertDailyEntry({ id: crypto.randomUUID(), athleteId: athlete.id, date: today, weightKg: a.weightKg, ...(a.bodyFatPct ? { bodyFatPct: a.bodyFatPct } : {}) })

  await applyPlansAndPrefs(athlete.id, a, t.result, app)
  return athlete
}

/**
 * „Dein Start“ erneut durchlaufen: aktualisiert den bestehenden Athleten statt einen neuen
 * anzulegen. Startdatum und Verlauf bleiben, die Pläne werden durch die neuen ersetzt.
 */
export async function updateFromStart(athleteId: string, a: StartAnswers, app: StartAppChoices): Promise<void> {
  const today = todayIso()
  const t = computeTargets(a, today)
  await db.athletes.update(athleteId, { ...athleteFields(a, t), accentColor: app.accentColor })

  // Gewicht/KFA nur eintragen, wenn sie sich gegenüber dem letzten Stand geändert haben.
  const entries = await db.dailyEntries.where('athleteId').equals(athleteId).sortBy('date')
  const lastWeight = entries.filter((e) => e.weightKg).at(-1)?.weightKg
  const lastFat = entries.filter((e) => e.bodyFatPct).at(-1)?.bodyFatPct
  const patch = {
    ...(a.weightKg !== lastWeight ? { weightKg: a.weightKg } : {}),
    ...(a.bodyFatPct && a.bodyFatPct !== lastFat ? { bodyFatPct: a.bodyFatPct } : {}),
  }
  if (Object.keys(patch).length > 0) await upsertDailyEntry({ id: crypto.randomUUID(), athleteId, date: today, ...patch })

  await applyPlansAndPrefs(athleteId, a, t.result, app)
}

function athleteFields(a: StartAnswers, t: ReturnType<typeof computeTargets>) {
  return {
    name: a.firstName.trim() || 'Ich',
    gender: a.gender,
    age: t.age,
    birthDate: a.birthDate,
    heightCm: a.heightCm,
    weightKg: a.weightKg,
    activityLevel: t.activityLevel,
    goal: t.goalLabel,
    proteinPerKg: t.proteinPerKg,
    fatPerKg: t.fatPerKg,
    targetWeightKg: t.targetWeightKg,
    targetDate: t.targetDate,
    trainingDays: a.scheduleMode === 'rotation' ? [] : [...a.trainingDays].sort((x, y) => x - y),
    schedule:
      a.scheduleMode === 'rotation'
        ? ({ mode: 'rotation', ...a.rotation } as const)
        : ({ mode: 'fixed', dayPlans: buildTrainingWeek(a).schedule.map((x) => x.unit) } as const),
    startAnswers: a,
  }
}

async function applyPlansAndPrefs(athleteId: string, a: StartAnswers, macros: { proteinG: number; carbsG: number; fatG: number }, app: StartAppChoices): Promise<void> {
  await replaceTrainingPlans(athleteId, a)
  await replaceNutritionPlans(athleteId, a, macros)
  await replaceSupplementPlans(athleteId, a)

  const reminders = {
    weigh: { on: app.reminders.weigh, time: '07:30' },
    food: { on: app.reminders.food, time: '20:00' },
    water: { on: app.reminders.water, everyHours: 2 },
  }
  setPrefs({
    weightUnit: app.weightUnit,
    lengthUnit: app.lengthUnit,
    volumeUnit: app.volumeUnit,
    startTab: app.hiddenTabs.includes(app.startTab) ? 'dashboard' : app.startTab,
    hiddenTabs: app.hiddenTabs,
    reminders,
  })
  applyTheme(app.theme)
}

async function replaceTrainingPlans(athleteId: string, a: StartAnswers): Promise<void> {
  const days = buildTrainingWeek(a).days
  await ensureExerciseSeed()
  await db.transaction('rw', db.trainingPlans, db.trainingPlanExercises, db.exercises, async () => {
    const old = await db.trainingPlans.where('athleteId').equals(athleteId).toArray()
    for (const p of old) await db.trainingPlanExercises.where('planId').equals(p.id).delete()
    await db.trainingPlans.where('athleteId').equals(athleteId).delete()
    const exercises = byName(await db.exercises.toArray())
    for (const [i, day] of days.entries()) {
      const planId = crypto.randomUUID()
      await db.trainingPlans.add({ id: planId, athleteId, phaseName: day.name, order: i })
      for (const [j, e] of day.exercises.entries()) {
        let ex = exercises.get(nameKey(e.name))
        if (!ex) {
          ex = { id: crypto.randomUUID(), name: e.name, muscleGroup: 'Sonstiges' }
          await db.exercises.add(ex)
          exercises.set(nameKey(e.name), ex)
        }
        await db.trainingPlanExercises.add({
          id: crypto.randomUUID(),
          planId,
          exerciseId: ex.id,
          order: j,
          sets: e.sets,
          reps: e.reps,
          ...(e.restSeconds ? { restSeconds: e.restSeconds } : {}),
          ...(e.warmupSets ? { warmupSets: e.warmupSets } : {}),
          ...(e.note ? { notes: e.note } : {}),
        })
      }
    }
  })
}

async function replaceNutritionPlans(athleteId: string, a: StartAnswers, targets: { proteinG: number; carbsG: number; fatG: number }): Promise<void> {
  const foods = (await db.foodItems.toArray()).filter((f) => !f.quick)
  const days = buildMealPlans(a, targets, foods)
  await db.transaction('rw', db.nutritionPlans, db.planMeals, async () => {
    const old = (await db.nutritionPlans.where('athleteId').equals(athleteId).toArray()).filter((p) => !p.isRecipe)
    for (const p of old) await db.planMeals.where('planId').equals(p.id).delete()
    await db.nutritionPlans.bulkDelete(old.map((p) => p.id))
    const byFood = byName(foods)
    for (const [i, day] of days.entries()) {
      const planId = crypto.randomUUID()
      await db.nutritionPlans.add({ id: planId, athleteId, phaseName: day.name, order: i })
      for (const [j, item] of day.items.entries()) {
        const food = byFood.get(nameKey(item.food))
        if (food) await db.planMeals.add({ id: crypto.randomUUID(), planId, mealType: item.meal as MealType, foodItemId: food.id, grams: item.grams, order: j })
      }
    }
  })
}

async function replaceSupplementPlans(athleteId: string, a: StartAnswers): Promise<void> {
  const names = supplementNamesFor(a)
  if (names.length === 0) return
  await db.transaction('rw', db.supplementPlans, db.supplementPlanItems, db.supplements, async () => {
    const old = await db.supplementPlans.where('athleteId').equals(athleteId).toArray()
    for (const p of old) await db.supplementPlanItems.where('planId').equals(p.id).delete()
    await db.supplementPlans.where('athleteId').equals(athleteId).delete()
    const planId = crypto.randomUUID()
    await db.supplementPlans.add({ id: planId, athleteId, phaseName: 'Basis', order: 0 })
    const supplements = byName(await db.supplements.toArray())
    let order = 0
    for (const name of names) {
      const s = supplements.get(nameKey(name))
      if (s) await db.supplementPlanItems.add({ id: crypto.randomUUID(), planId, supplementId: s.id, dose: s.defaultDose, timing: s.defaultTiming, order: order++ })
    }
  })
}
