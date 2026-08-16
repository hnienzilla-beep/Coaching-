import { db } from '../../db/db'
import { caloriesFromMacros } from '../../lib/calculator'
import type {
  DailyEntry,
  Exercise,
  NutritionLog,
  NutritionPlan,
  Supplement,
  SupplementPlan,
  WorkoutLog,
} from '../../models/types'
import { byName, nameKey, record, requireSettings } from './importLog'
import type { ImportResult } from './importLog'
import {
  parseErnaehrungLog,
  parseGewicht,
  parseMealPhases,
  parseSupplemente,
  parseTraining,
} from './markdownParse'
import { withVaultImport } from './syncState'

/**
 * Übernimmt Änderungen aus dem Vault (Obsidian oder ein zweites Gerät) zurück in die App.
 *
 * Grundsätze:
 * - Nur Dateien, die im Vault tatsächlich geändert wurden, werden eingelesen (der Sync
 *   vergleicht dafür den GitHub-SHA mit dem zuletzt gesehenen).
 * - Tagesdateien (Training, Ernährungslog) und die Inhalte einer Plan-Phase werden komplett
 *   ersetzt - so wirken auch im Vault gelöschte Zeilen.
 * - Gewicht.md wird zusammengeführt: vorhandene Datumszeilen werden übernommen, im Vault
 *   fehlende Tage bleiben in der App erhalten (Tabellen werden dort gern gekürzt). Auch leere
 *   Zellen lassen den Wert in der App unangetastet.
 * - Plan-Phasen und Stammdaten (Übungen, Supplemente, Lebensmittel) werden über den Vault nie
 *   gelöscht - sie sind aus Plänen und Logs referenziert. Gelöscht wird nur in der App.
 * - Lebensmittel in Tageslogs und Plänen werden nur zugeordnet, nicht angelegt: Aus
 *   "80g (300 kcal)" lassen sich keine Makros zurückrechnen. Unbekannte Namen werden gemeldet
 *   statt geraten - nachtragen lassen sie sich über Lebensmittel.md bzw. Lebensmittel-Neu.md.
 */

/** Datum aus einem Dateipfad wie "20-Fitness/Training/2026-07-28.md". */
export function dateFromPath(path: string): string | null {
  const match = path.match(/(\d{4}-\d{2}-\d{2})\.md$/)
  return match ? match[1] : null
}

// ---------------------------------------------------------------- Gewicht.md

/** Die Tracking-Felder, die in Gewicht.md stehen - in der Spaltenreihenfolge der Tabelle. */
export const TRACKING_FIELDS = [
  'weightKg',
  'bodyFatPct',
  'calories',
  'protein',
  'carbs',
  'fat',
  'waist',
  'arm',
  'chest',
  'leg',
  'notes',
] as const

/**
 * Übernimmt die Tracking-Tabelle: Gewicht, Körperfettanteil, Kalorien/Makros, Umfänge und die
 * Tagesnotiz. Zusammenführend statt ersetzend - eine leere Zelle heißt "hier steht nichts", nicht
 * "Wert löschen", weil Tabellen in Obsidian gern gekürzt werden.
 */
export async function importGewicht(content: string): Promise<ImportResult> {
  const settings = requireSettings()
  const rows = parseGewicht(content)
  let changed = 0

  await withVaultImport(async () => {
    await db.transaction('rw', db.dailyEntries, async () => {
      for (const row of rows) {
        const existing = await db.dailyEntries.where('[athleteId+date]').equals([settings.athleteId, row.date]).first()

        const patch: Partial<DailyEntry> = {}
        for (const field of TRACKING_FIELDS) {
          const value = row[field]
          if (value === undefined) continue
          if (existing && existing[field] === value) continue
          Object.assign(patch, { [field]: value })
        }

        if (existing) {
          if (Object.keys(patch).length === 0) continue
          await db.dailyEntries.update(existing.id, patch)
        } else {
          await db.dailyEntries.add({
            id: crypto.randomUUID(),
            athleteId: settings.athleteId,
            date: row.date,
            ...patch,
          })
        }
        changed++
      }
    })
  })

  return record({ label: 'Gewicht', changed, skipped: [] })
}

// ------------------------------------------------------- Training/<datum>.md

export async function importTraining(date: string, content: string): Promise<ImportResult> {
  const settings = requireSettings()
  const day = parseTraining(content)
  if (day.exercises.length === 0) {
    // Leere oder unlesbare Datei: lieber nichts tun, als ein Training zu löschen.
    return record({ label: `Training ${date}`, changed: 0, skipped: [] })
  }

  let changed = 0
  await withVaultImport(async () => {
    await db.transaction(
      'rw',
      db.workoutLogs,
      db.workoutLogExercises,
      db.workoutSets,
      db.exercises,
      db.trainingPlans,
      async () => {
        let log = await db.workoutLogs.where('[athleteId+date]').equals([settings.athleteId, date]).first()
        if (!log) {
          log = { id: crypto.randomUUID(), athleteId: settings.athleteId, date }
          await db.workoutLogs.add(log)
        }

        // Kopfdaten des Tages: Plan (über den Phasennamen), Start/Ende und Trainingsnotiz.
        const patch: Partial<WorkoutLog> = {}
        if (day.planName) {
          const plans = await db.trainingPlans.where('athleteId').equals(settings.athleteId).toArray()
          const plan = plans.find((p) => nameKey(p.phaseName) === nameKey(day.planName as string))
          if (plan && plan.id !== log.trainingPlanId) patch.trainingPlanId = plan.id
        }
        if (day.startedAt && day.startedAt !== log.startedAt) patch.startedAt = day.startedAt
        if (day.completedAt && day.completedAt !== log.completedAt) patch.completedAt = day.completedAt
        if (day.notes !== log.notes) patch.notes = day.notes
        if (Object.keys(patch).length > 0) await db.workoutLogs.update(log.id, patch)

        // Tag komplett neu aufbauen, damit im Vault gelöschte Sätze auch hier verschwinden.
        const oldExercises = await db.workoutLogExercises.where('workoutLogId').equals(log.id).toArray()
        for (const old of oldExercises) {
          await db.workoutSets.where('workoutLogExerciseId').equals(old.id).delete()
        }
        await db.workoutLogExercises.where('workoutLogId').equals(log.id).delete()

        const exerciseMap = byName(await db.exercises.toArray())
        let order = 0
        for (const parsedExercise of day.exercises) {
          const key = nameKey(parsedExercise.name)
          let exercise: Exercise | undefined = exerciseMap.get(key)
          if (!exercise) {
            // Übungen dürfen angelegt werden - anders als bei Lebensmitteln fehlen dabei
            // keine Nährwerte, nur die Muskelgruppe ist zunächst unbekannt.
            exercise = { id: crypto.randomUUID(), name: parsedExercise.name.trim(), muscleGroup: 'Sonstiges' }
            await db.exercises.add(exercise)
            exerciseMap.set(key, exercise)
          }

          const logExerciseId = crypto.randomUUID()
          await db.workoutLogExercises.add({
            id: logExerciseId,
            workoutLogId: log.id,
            exerciseId: exercise.id,
            order: order++,
            notes: parsedExercise.notes,
          })
          for (const set of parsedExercise.sets) {
            await db.workoutSets.add({
              id: crypto.randomUUID(),
              workoutLogExerciseId: logExerciseId,
              setNumber: set.setNumber,
              reps: set.reps,
              weightKg: set.weightKg,
              rpe: set.rpe,
              done: set.done,
            })
            changed++
          }
        }
      },
    )
  })

  return record({ label: `Training ${date}`, changed, skipped: [] })
}

// ------------------------------------------------------------ Supplemente.md

export async function importSupplemente(content: string): Promise<ImportResult> {
  const settings = requireSettings()
  const phases = parseSupplemente(content)
  if (phases.length === 0) {
    return record({ label: 'Supplemente', changed: 0, skipped: [] })
  }

  let changed = 0
  await withVaultImport(async () => {
    await db.transaction('rw', db.supplementPlans, db.supplementPlanItems, db.supplements, async () => {
      const plans = await db.supplementPlans.where('athleteId').equals(settings.athleteId).sortBy('order')
      const planByName = new Map(plans.map((p) => [nameKey(p.phaseName), p]))
      const supplementMap = byName(await db.supplements.toArray())
      let nextOrder = plans.length

      for (const phase of phases) {
        // Ohne "## Plan:"-Überschrift (handgeschriebene oder alte Datei) gilt die erste Phase.
        let plan: SupplementPlan | undefined = phase.phaseName ? planByName.get(nameKey(phase.phaseName)) : plans[0]
        if (!plan) {
          plan = {
            id: crypto.randomUUID(),
            athleteId: settings.athleteId,
            phaseName: phase.phaseName ?? 'Aus Vault importiert',
            order: nextOrder++,
          }
          await db.supplementPlans.add(plan)
          planByName.set(nameKey(plan.phaseName), plan)
        }

        await db.supplementPlanItems.where('planId').equals(plan.id).delete()

        // Die Reihenfolge der Datei wird zur Reihenfolge im Plan - in Obsidian umgestellte
        // Zeilen stehen danach auch in der App so.
        let itemOrder = 0
        for (const item of phase.items) {
          const key = nameKey(item.name)
          let supplement: Supplement | undefined = supplementMap.get(key)
          if (!supplement) {
            supplement = {
              id: crypto.randomUUID(),
              name: item.name,
              defaultDose: item.dose,
              defaultTiming: item.timing,
            }
            await db.supplements.add(supplement)
            supplementMap.set(key, supplement)
          }
          await db.supplementPlanItems.add({
            id: crypto.randomUUID(),
            planId: plan.id,
            supplementId: supplement.id,
            dose: item.dose,
            timing: item.timing,
            notes: item.notes,
            order: itemOrder++,
          })
          changed++
        }
      }
    })
  })

  return record({ label: 'Supplemente', changed, skipped: [] })
}

// ------------------------------------------------------- Ernaehrungsplan.md

export async function importErnaehrungsplan(content: string): Promise<ImportResult> {
  const settings = requireSettings()
  const phases = parseMealPhases(content)
  if (phases.length === 0) {
    return record({ label: 'Ernährungsplan', changed: 0, skipped: [] })
  }

  let changed = 0
  const skipped: string[] = []

  await withVaultImport(async () => {
    await db.transaction('rw', db.nutritionPlans, db.planMeals, db.foodItems, async () => {
      const plans = await db.nutritionPlans.where('athleteId').equals(settings.athleteId).sortBy('order')
      const planByName = new Map(plans.map((p) => [nameKey(p.phaseName), p]))
      const foodMap = byName(await db.foodItems.toArray())
      let nextOrder = plans.length

      for (const phase of phases) {
        const resolved = phase.items.map((item) => ({ item, food: foodMap.get(nameKey(item.name)) }))
        for (const { item, food } of resolved) {
          if (!food) skipped.push(item.name)
        }
        // Ist in dieser Phase kein einziger Eintrag zuzuordnen, war die Datei vermutlich
        // handgeschrieben - dann bleibt der bestehende Plan lieber unangetastet.
        if (resolved.every((r) => !r.food)) continue

        let plan: NutritionPlan | undefined = phase.phaseName ? planByName.get(nameKey(phase.phaseName)) : plans[0]
        if (!plan) {
          plan = {
            id: crypto.randomUUID(),
            athleteId: settings.athleteId,
            phaseName: phase.phaseName ?? 'Aus Vault importiert',
            order: nextOrder++,
          }
          await db.nutritionPlans.add(plan)
          planByName.set(nameKey(plan.phaseName), plan)
        }

        await db.planMeals.where('planId').equals(plan.id).delete()
        let order = 0
        for (const { item, food } of resolved) {
          if (!food) continue
          await db.planMeals.add({
            id: crypto.randomUUID(),
            planId: plan.id,
            mealType: item.mealType,
            foodItemId: food.id,
            grams: item.grams,
            order: order++,
          })
          changed++
        }
      }
    })
  })

  return record({ label: 'Ernährungsplan', changed, skipped })
}

// ---------------------------------------------------------- Log/<datum>.md

export async function importErnaehrungLog(date: string, content: string): Promise<ImportResult> {
  const settings = requireSettings()
  const day = parseErnaehrungLog(content)
  if (day.items.length === 0) {
    return record({ label: `Ernährung ${date}`, changed: 0, skipped: [] })
  }

  let changed = 0
  const skipped: string[] = []

  await withVaultImport(async () => {
    await db.transaction(
      'rw',
      db.nutritionLogs,
      db.nutritionLogItems,
      db.nutritionPlans,
      db.foodItems,
      db.dailyEntries,
      async () => {
        const foodMap = byName(await db.foodItems.toArray())
        const resolved = day.items.map((item) => ({ item, food: foodMap.get(nameKey(item.name)) }))
        for (const { item, food } of resolved) {
          if (!food) skipped.push(item.name)
        }
        if (resolved.every((r) => !r.food)) return

        let log: NutritionLog | undefined = await db.nutritionLogs
          .where('[athleteId+date]')
          .equals([settings.athleteId, date])
          .first()
        if (!log) {
          log = { id: crypto.randomUUID(), athleteId: settings.athleteId, date }
          await db.nutritionLogs.add(log)
        }

        const patch: Partial<NutritionLog> = {}
        if (day.planName) {
          const plans = await db.nutritionPlans.where('athleteId').equals(settings.athleteId).toArray()
          const plan = plans.find((p) => nameKey(p.phaseName) === nameKey(day.planName as string))
          if (plan && plan.id !== log.nutritionPlanId) patch.nutritionPlanId = plan.id
        }
        if (day.completedAt && day.completedAt !== log.completedAt) patch.completedAt = day.completedAt
        if (day.notes !== log.notes) patch.notes = day.notes
        if (Object.keys(patch).length > 0) await db.nutritionLogs.update(log.id, patch)

        await db.nutritionLogItems.where('nutritionLogId').equals(log.id).delete()

        let order = 0
        let protein = 0
        let carbs = 0
        let fat = 0
        for (const { item, food } of resolved) {
          if (!food) continue
          await db.nutritionLogItems.add({
            id: crypto.randomUUID(),
            nutritionLogId: log.id,
            mealType: item.mealType,
            foodItemId: food.id,
            grams: item.grams,
            order: order++,
            done: item.done,
          })
          changed++
          if (item.done) {
            const factor = item.grams / 100
            protein += food.protein * factor
            carbs += food.carbs * factor
            fat += food.fat * factor
          }
        }
        const calories = caloriesFromMacros(protein, carbs, fat)

        // Tagessumme wie in der App nachziehen, damit Tracking und Log zusammenpassen.
        const entry = await db.dailyEntries.where('[athleteId+date]').equals([settings.athleteId, date]).first()
        const totals = {
          calories: Math.round(calories),
          protein: Math.round(protein),
          carbs: Math.round(carbs),
          fat: Math.round(fat),
        }
        if (entry) {
          await db.dailyEntries.update(entry.id, totals)
        } else {
          await db.dailyEntries.add({ id: crypto.randomUUID(), athleteId: settings.athleteId, date, ...totals })
        }
      },
    )
  })

  return record({ label: `Ernährung ${date}`, changed, skipped })
}
