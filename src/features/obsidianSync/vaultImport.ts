import { db } from '../../db/db'
import { isoDate } from '../../db/queries'
import { caloriesFromMacros } from '../../lib/calculator'
import type { FoodItem, MuscleGroup, SupplementTiming } from '../../models/types'
import { getSyncSettings } from './settings'
import { listMarkdownFiles, readFile, writeFile } from './githubApi'
import { withVaultImport } from './syncState'
import {
  parseGewicht,
  parseLebensmittelNeu,
  parseMeals,
  parseSupplemente,
  parseTraining,
  rebuildLebensmittelNeu,
  splitTableRow,
} from './markdownParse'

/**
 * Übernimmt Änderungen aus dem Vault (Obsidian oder ein zweites Gerät) zurück in die App.
 *
 * Grundsätze:
 * - Nur Dateien, die im Vault tatsächlich geändert wurden, werden eingelesen (der Sync
 *   vergleicht dafür den GitHub-SHA mit dem zuletzt gesehenen).
 * - Tagesdateien (Training, Ernährungslog) und Pläne werden für den jeweiligen Tag bzw.
 *   Plan komplett ersetzt - so wirken auch im Vault gelöschte Zeilen.
 * - Gewicht.md wird zusammengeführt: vorhandene Datumszeilen werden übernommen, im Vault
 *   fehlende Tage bleiben in der App erhalten (Tabellen werden dort gern gekürzt).
 * - Lebensmittel werden nur zugeordnet, nicht angelegt: Aus "80g (300 kcal)" lassen sich
 *   keine Makros zurückrechnen. Unbekannte Namen werden gemeldet statt geraten.
 */

export interface ImportResult {
  /** Was importiert wurde, z.B. "Gewicht" oder "Training 2026-07-28". */
  label: string
  /** Anzahl übernommener Einträge. */
  changed: number
  /** Übersprungenes: unbekannte Lebensmittel bzw. fehlerhafte Zeilen. */
  skipped: string[]
}

// Sammelt die Ergebnisse eines Sync-Laufs, damit die Oberfläche zeigen kann, was kam.
let collected: ImportResult[] = []

export function resetImportLog(): void {
  collected = []
}

export function getImportLog(): ImportResult[] {
  return collected
}

/** Kurzfassung für die Statusanzeige, z.B. "Gewicht (12), Training 2026-07-28 (4)". */
export function summarizeImports(results: ImportResult[]): string | null {
  const relevant = results.filter((r) => r.changed > 0 || r.skipped.length > 0)
  if (relevant.length === 0) return null
  return relevant
    .map((r) => {
      const skipped = r.skipped.length > 0 ? `, ${r.skipped.length} übersprungen` : ''
      return `${r.label} (${r.changed}${skipped})`
    })
    .join(', ')
}

function record(result: ImportResult): ImportResult {
  collected.push(result)
  return result
}

function requireSettings() {
  const settings = getSyncSettings()
  if (!settings) throw new Error('Obsidian-Sync ist noch nicht eingerichtet.')
  return settings
}

function byName<T extends { name: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.name.trim().toLowerCase(), item]))
}

/** Datum aus einem Dateipfad wie "20-Fitness/Training/2026-07-28.md". */
export function dateFromPath(path: string): string | null {
  const match = path.match(/(\d{4}-\d{2}-\d{2})\.md$/)
  return match ? match[1] : null
}

// ---------------------------------------------------------------- Gewicht.md

export async function importGewicht(content: string): Promise<ImportResult> {
  const settings = requireSettings()
  const rows = parseGewicht(content)
  let changed = 0

  await withVaultImport(async () => {
    await db.transaction('rw', db.dailyEntries, async () => {
      for (const row of rows) {
        const existing = await db.dailyEntries.where('[athleteId+date]').equals([settings.athleteId, row.date]).first()
        if (existing) {
          if (existing.weightKg === row.weightKg) continue
          // Nur das Gewicht anfassen - Maße, Makros und Notizen des Tages bleiben stehen.
          await db.dailyEntries.update(existing.id, { weightKg: row.weightKg })
        } else {
          await db.dailyEntries.add({
            id: crypto.randomUUID(),
            athleteId: settings.athleteId,
            date: row.date,
            weightKg: row.weightKg,
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
  const parsed = parseTraining(content)
  if (parsed.length === 0) {
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
      async () => {
        let log = await db.workoutLogs.where('[athleteId+date]').equals([settings.athleteId, date]).first()
        if (!log) {
          log = { id: crypto.randomUUID(), athleteId: settings.athleteId, date }
          await db.workoutLogs.add(log)
        }

        // Tag komplett neu aufbauen, damit im Vault gelöschte Sätze auch hier verschwinden.
        const oldExercises = await db.workoutLogExercises.where('workoutLogId').equals(log.id).toArray()
        for (const old of oldExercises) {
          await db.workoutSets.where('workoutLogExerciseId').equals(old.id).delete()
        }
        await db.workoutLogExercises.where('workoutLogId').equals(log.id).delete()

        const exerciseMap = byName(await db.exercises.toArray())
        let order = 0
        for (const parsedExercise of parsed) {
          const key = parsedExercise.name.trim().toLowerCase()
          let exercise = exerciseMap.get(key)
          if (!exercise) {
            // Übungen dürfen angelegt werden - anders als bei Lebensmitteln fehlen dabei
            // keine Nährwerte, nur die Muskelgruppe ist zunächst unbekannt.
            exercise = { id: crypto.randomUUID(), name: parsedExercise.name.trim(), muscleGroup: 'Sonstiges' as MuscleGroup }
            await db.exercises.add(exercise)
            exerciseMap.set(key, exercise)
          }

          const logExerciseId = crypto.randomUUID()
          await db.workoutLogExercises.add({ id: logExerciseId, workoutLogId: log.id, exerciseId: exercise.id, order: order++ })
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
  const parsed = parseSupplemente(content)
  if (parsed.items.length === 0) {
    return record({ label: 'Supplemente', changed: 0, skipped: [] })
  }

  let changed = 0
  await withVaultImport(async () => {
    await db.transaction('rw', db.supplementPlans, db.supplementPlanItems, db.supplements, async () => {
      const plans = await db.supplementPlans.where('athleteId').equals(settings.athleteId).sortBy('order')
      let plan = plans[0]
      if (!plan) {
        plan = {
          id: crypto.randomUUID(),
          athleteId: settings.athleteId,
          phaseName: parsed.phaseName ?? 'Aus Vault importiert',
          order: 0,
        }
        await db.supplementPlans.add(plan)
      } else if (parsed.phaseName && parsed.phaseName !== plan.phaseName) {
        await db.supplementPlans.update(plan.id, { phaseName: parsed.phaseName })
      }

      await db.supplementPlanItems.where('planId').equals(plan.id).delete()

      const supplementMap = byName(await db.supplements.toArray())
      for (const item of parsed.items) {
        const key = item.name.toLowerCase()
        let supplement = supplementMap.get(key)
        if (!supplement) {
          supplement = {
            id: crypto.randomUUID(),
            name: item.name,
            defaultDose: item.dose,
            defaultTiming: item.timing as SupplementTiming,
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
        })
        changed++
      }
    })
  })

  return record({ label: 'Supplemente', changed, skipped: [] })
}

// ------------------------------------------------------- Ernaehrungsplan.md

export async function importErnaehrungsplan(content: string): Promise<ImportResult> {
  const settings = requireSettings()
  const parsed = parseMeals(content)
  if (parsed.items.length === 0) {
    return record({ label: 'Ernährungsplan', changed: 0, skipped: [] })
  }

  let changed = 0
  const skipped: string[] = []

  await withVaultImport(async () => {
    await db.transaction('rw', db.nutritionPlans, db.planMeals, db.foodItems, async () => {
      const plans = await db.nutritionPlans.where('athleteId').equals(settings.athleteId).sortBy('order')
      let plan = plans[0]
      if (!plan) {
        plan = {
          id: crypto.randomUUID(),
          athleteId: settings.athleteId,
          phaseName: parsed.phaseName ?? 'Aus Vault importiert',
          order: 0,
        }
        await db.nutritionPlans.add(plan)
      } else if (parsed.phaseName && parsed.phaseName !== plan.phaseName) {
        await db.nutritionPlans.update(plan.id, { phaseName: parsed.phaseName })
      }

      const foodMap = byName(await db.foodItems.toArray())
      const resolved = parsed.items.map((item) => ({ item, food: foodMap.get(item.name.toLowerCase()) }))
      for (const { item, food } of resolved) {
        if (!food) skipped.push(item.name)
      }
      // Ist kein einziger Eintrag zuzuordnen, war die Datei vermutlich handgeschrieben -
      // dann bleibt der bestehende Plan lieber unangetastet.
      if (resolved.every((r) => !r.food)) return

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
    })
  })

  return record({ label: 'Ernährungsplan', changed, skipped })
}

// ---------------------------------------------------------- Log/<datum>.md

export async function importErnaehrungLog(date: string, content: string): Promise<ImportResult> {
  const settings = requireSettings()
  const parsed = parseMeals(content)
  if (parsed.items.length === 0) {
    return record({ label: `Ernährung ${date}`, changed: 0, skipped: [] })
  }

  let changed = 0
  const skipped: string[] = []

  await withVaultImport(async () => {
    await db.transaction('rw', db.nutritionLogs, db.nutritionLogItems, db.foodItems, db.dailyEntries, async () => {
      const foodMap = byName(await db.foodItems.toArray())
      const resolved = parsed.items.map((item) => ({ item, food: foodMap.get(item.name.toLowerCase()) }))
      for (const { item, food } of resolved) {
        if (!food) skipped.push(item.name)
      }
      if (resolved.every((r) => !r.food)) return

      let log = await db.nutritionLogs.where('[athleteId+date]').equals([settings.athleteId, date]).first()
      if (!log) {
        log = { id: crypto.randomUUID(), athleteId: settings.athleteId, date }
        await db.nutritionLogs.add(log)
      }

      await db.nutritionLogItems.where('nutritionLogId').equals(log.id).delete()

      let order = 0
      let calories = 0
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
      calories = caloriesFromMacros(protein, carbs, fat)

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
    })
  })

  return record({ label: `Ernährung ${date}`, changed, skipped })
}

// ------------------------------------------------------- Lebensmittel-Neu.md

export const LEBENSMITTEL_NEU_PATH = '40-Ernaehrung/Lebensmittel-Neu.md'

/**
 * Legt die in Lebensmittel-Neu.md vorgeschlagenen Lebensmittel in der Datenbank an und leert
 * anschließend die Tabelle in der Datei.
 *
 * - Namen, die es in der Datenbank schon gibt, werden verworfen: die Datenbank hat Vorrang,
 *   Schätzwerte dürfen gemessene Nährwerte nie überschreiben.
 * - Neue Einträge werden als `unconfirmed` markiert, damit in der App erkennbar bleibt, was
 *   geschätzt und nicht aus einer Nährwertquelle übernommen ist.
 * - Fehlerhafte Zeilen (falsche Spaltenzahl, nicht-numerische Werte) werden übersprungen und
 *   bleiben in der Datei stehen, statt den ganzen Import abzubrechen.
 *
 * `null`, wenn es die Datei im Vault nicht gibt oder ihre Tabelle leer ist.
 */
export async function importLebensmittelNeu(): Promise<ImportResult | null> {
  requireSettings()
  const remote = await readFile(LEBENSMITTEL_NEU_PATH)
  if (!remote) return null

  const rows = parseLebensmittelNeu(remote.content)
  if (rows.length === 0) return null

  const keptLines: string[] = []
  const skipped: string[] = []
  let changed = 0

  await withVaultImport(async () => {
    await db.transaction('rw', db.foodItems, async () => {
      const existing = byName(await db.foodItems.toArray())
      for (const row of rows) {
        if (!row.food) {
          keptLines.push(row.line)
          skipped.push(splitTableRow(row.line)[0] || row.line.trim())
          continue
        }
        const key = row.food.name.toLowerCase()
        if (existing.has(key)) continue // schon in der Datenbank - Zeile verwerfen
        const item: FoodItem = {
          id: crypto.randomUUID(),
          name: row.food.name,
          kcal: row.food.kcal,
          protein: row.food.protein,
          carbs: row.food.carbs,
          fat: row.food.fat,
          unconfirmed: true,
        }
        await db.foodItems.add(item)
        existing.set(key, item)
        changed++
      }
    })
  })

  const emptied = rebuildLebensmittelNeu(remote.content, keptLines)
  if (emptied !== null) {
    await writeFile(LEBENSMITTEL_NEU_PATH, emptied, `Sync ${isoDate(new Date())}: Lebensmittel-Neu`, remote.sha)
  }

  return record({ label: 'Neue Lebensmittel', changed, skipped })
}

// ------------------------------------------------------------- Voll-Import

/**
 * Liest den kompletten Vault ein - auch Tage, die der laufende Sync nicht anfasst.
 * Gedacht für "Aus Vault importieren" (neues Gerät, Wiederherstellung).
 */
export async function importAllFromVault(): Promise<ImportResult[]> {
  requireSettings()
  resetImportLog()

  const gewicht = await readFile('20-Fitness/Gewicht.md')
  if (gewicht) await importGewicht(gewicht.content)

  const supplemente = await readFile('20-Fitness/Supplemente.md')
  if (supplemente) await importSupplemente(supplemente.content)

  // Vor Plan und Tageslogs: dort vorkommende Lebensmittel sind danach zuordenbar.
  await importLebensmittelNeu()

  const plan = await readFile('40-Ernaehrung/Ernaehrungsplan.md')
  if (plan) await importErnaehrungsplan(plan.content)

  for (const path of await listMarkdownFiles('20-Fitness/Training')) {
    const date = dateFromPath(path)
    if (!date) continue
    const file = await readFile(path)
    if (file) await importTraining(date, file.content)
  }

  for (const path of await listMarkdownFiles('40-Ernaehrung/Log')) {
    const date = dateFromPath(path)
    if (!date) continue
    const file = await readFile(path)
    if (file) await importErnaehrungLog(date, file.content)
  }

  return getImportLog()
}
