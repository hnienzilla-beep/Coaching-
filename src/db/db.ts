import Dexie, { type EntityTable } from 'dexie'
import type {
  Athlete,
  BackgroundPhoto,
  DailyEntry,
  Exercise,
  FoodItem,
  MealType,
  MuscleGroup,
  NutritionLog,
  NutritionLogItem,
  NutritionPlan,
  PlanMeal,
  Supplement,
  SupplementPlan,
  SupplementPlanItem,
  SupplementTiming,
  TrainingPlan,
  TrainingPlanExercise,
  WorkoutLog,
  WorkoutLogExercise,
  WorkoutSet,
} from '../models/types'
import { FOOD_SEED } from '../data/foodSeed'
import { SUPPLEMENT_SEED } from '../data/supplementSeed'
import { EXERCISE_SEED } from '../data/exerciseSeed'
import { byName, nameKey } from '../lib/names'

export class CoachDB extends Dexie {
  athletes!: EntityTable<Athlete, 'id'>
  backgroundPhoto!: EntityTable<BackgroundPhoto, 'id'>
  dailyEntries!: EntityTable<DailyEntry, 'id'>
  foodItems!: EntityTable<FoodItem, 'id'>
  nutritionPlans!: EntityTable<NutritionPlan, 'id'>
  planMeals!: EntityTable<PlanMeal, 'id'>
  supplements!: EntityTable<Supplement, 'id'>
  supplementPlans!: EntityTable<SupplementPlan, 'id'>
  supplementPlanItems!: EntityTable<SupplementPlanItem, 'id'>
  exercises!: EntityTable<Exercise, 'id'>
  trainingPlans!: EntityTable<TrainingPlan, 'id'>
  trainingPlanExercises!: EntityTable<TrainingPlanExercise, 'id'>
  workoutLogs!: EntityTable<WorkoutLog, 'id'>
  workoutLogExercises!: EntityTable<WorkoutLogExercise, 'id'>
  workoutSets!: EntityTable<WorkoutSet, 'id'>
  nutritionLogs!: EntityTable<NutritionLog, 'id'>
  nutritionLogItems!: EntityTable<NutritionLogItem, 'id'>

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
    this.version(4).stores({
      workoutSets: 'id, workoutLogExerciseId',
    })
    this.version(5).stores({
      nutritionLogs: 'id, athleteId, date, [athleteId+date]',
      nutritionLogItems: 'id, nutritionLogId',
    })
    this.version(6).stores({
      backgroundPhoto: 'id',
    })
  }
}

export const db = new CoachDB()

export async function ensureFoodSeed(): Promise<void> {
  // Transaktion serialisiert parallele Aufrufe (z.B. React StrictMode-Doppelaufruf in Dev) -
  // ohne das würde ein zweiter Aufruf den Datenbestand ein zweites Mal einfügen.
  // Nachfüll-Logik statt reinem "leer?"-Check: ergänzt neu hinzugekommene FOOD_SEED-Einträge
  // auch bei Bestandsnutzern, ohne eigene/bearbeitete Lebensmittel anzufassen.
  // Verglichen wird über `nameKey` (wie beim Vault-Import), sonst legt der Seed neben einem aus
  // dem Vault übernommenen "haferflocken" ein zweites "Haferflocken" an.
  await db.transaction('rw', db.foodItems, async () => {
    const existingNames = new Set((await db.foodItems.orderBy('name').keys()).map((n) => nameKey(String(n))))
    const missing = FOOD_SEED.filter((f) => !existingNames.has(nameKey(f.name)))
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
    const existingNames = new Set((await db.supplements.orderBy('name').keys()).map((n) => nameKey(String(n))))
    const missing = SUPPLEMENT_SEED.filter((s) => !existingNames.has(nameKey(s.name)))
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
    const existingNames = new Set((await db.exercises.orderBy('name').keys()).map((n) => nameKey(String(n))))
    const missing = EXERCISE_SEED.filter((e) => !existingNames.has(nameKey(e.name)))
    if (missing.length === 0) return
    await db.exercises.bulkAdd(missing.map((e) => ({ id: crypto.randomUUID(), name: e.name, muscleGroup: e.muscleGroup })))
  })
}

// Bestandsdaten (vor Einführung von order) bekommen eine Reihenfolge nach Einfüge-Position.
export async function ensureTrainingPlanExerciseOrder(): Promise<void> {
  await db.transaction('rw', db.trainingPlanExercises, async () => {
    const all = await db.trainingPlanExercises.toArray()
    const missingOrder = all.filter((r) => r.order === undefined)
    if (missingOrder.length === 0) return
    const byPlan = new Map<string, typeof all>()
    for (const row of missingOrder) {
      const list = byPlan.get(row.planId) ?? []
      list.push(row)
      byPlan.set(row.planId, list)
    }
    for (const [, rows] of byPlan) {
      for (let i = 0; i < rows.length; i++) {
        await db.trainingPlanExercises.update(rows[i].id, { order: i })
      }
    }
  })
}

// Bestandsdaten (vor Einführung von order) bekommen eine Reihenfolge nach Einfüge-Position.
export async function ensurePlanMealOrder(): Promise<void> {
  await db.transaction('rw', db.planMeals, async () => {
    const all = await db.planMeals.toArray()
    const missingOrder = all.filter((r) => r.order === undefined)
    if (missingOrder.length === 0) return
    const byPlan = new Map<string, typeof all>()
    for (const row of missingOrder) {
      const list = byPlan.get(row.planId) ?? []
      list.push(row)
      byPlan.set(row.planId, list)
    }
    for (const [, rows] of byPlan) {
      for (let i = 0; i < rows.length; i++) {
        await db.planMeals.update(rows[i].id, { order: i })
      }
    }
  })
}

// Bestandsdaten (vor Einführung von order) bekommen eine Reihenfolge nach Einfüge-Position.
export async function ensureSupplementPlanItemOrder(): Promise<void> {
  await db.transaction('rw', db.supplementPlanItems, async () => {
    const all = await db.supplementPlanItems.toArray()
    const missingOrder = all.filter((r) => r.order === undefined)
    if (missingOrder.length === 0) return
    const byPlan = new Map<string, typeof all>()
    for (const row of missingOrder) {
      const list = byPlan.get(row.planId) ?? []
      list.push(row)
      byPlan.set(row.planId, list)
    }
    for (const [, rows] of byPlan) {
      for (let i = 0; i < rows.length; i++) {
        await db.supplementPlanItems.update(rows[i].id, { order: i })
      }
    }
  })
}

// Bestandsdaten (vor Einführung von order) bekommen eine Reihenfolge nach Einfüge-Position.
export async function ensureWorkoutLogExerciseOrder(): Promise<void> {
  await db.transaction('rw', db.workoutLogExercises, async () => {
    const all = await db.workoutLogExercises.toArray()
    const missingOrder = all.filter((r) => r.order === undefined)
    if (missingOrder.length === 0) return
    const byLog = new Map<string, typeof all>()
    for (const row of missingOrder) {
      const list = byLog.get(row.workoutLogId) ?? []
      list.push(row)
      byLog.set(row.workoutLogId, list)
    }
    for (const [, rows] of byLog) {
      for (let i = 0; i < rows.length; i++) {
        await db.workoutLogExercises.update(rows[i].id, { order: i })
      }
    }
  })
}

// Bestandsathleten (vor Einführung von order) bekommen eine Reihenfolge nach aktueller Reihenfolge.
export async function ensureAthleteOrder(): Promise<void> {
  await db.transaction('rw', db.athletes, async () => {
    const all = await db.athletes.toArray()
    const missingOrder = all.filter((a) => a.order === undefined)
    if (missingOrder.length === 0) return
    const maxOrder = all.reduce((max, a) => (a.order !== undefined && a.order > max ? a.order : max), -1)
    for (let i = 0; i < missingOrder.length; i++) {
      await db.athletes.update(missingOrder[i].id, { order: maxOrder + 1 + i })
    }
  })
}

// Migriert alte WorkoutLogExercise-Datensätze (mit sets/reps/weightKg direkt am Datensatz)
// zu einzelnen WorkoutSet-Zeilen, damit bereits geloggte Trainingsdaten nicht verloren gehen.
export async function ensureWorkoutSetMigration(): Promise<void> {
  await db.transaction('rw', db.workoutLogExercises, db.workoutSets, async () => {
    const exercises = await db.workoutLogExercises.toArray()
    for (const ex of exercises) {
      const legacy = ex as unknown as { sets?: number; reps?: string; weightKg?: number }
      if (legacy.sets === undefined) continue
      const existingSets = await db.workoutSets.where('workoutLogExerciseId').equals(ex.id).count()
      if (existingSets === 0) {
        const setsToCreate = Math.max(1, legacy.sets)
        const repsNum = legacy.reps ? Number.parseInt(legacy.reps, 10) : undefined
        for (let i = 0; i < setsToCreate; i++) {
          await db.workoutSets.add({
            id: crypto.randomUUID(),
            workoutLogExerciseId: ex.id,
            setNumber: i + 1,
            reps: Number.isFinite(repsNum) ? repsNum : undefined,
            weightKg: legacy.weightKg,
          })
        }
      }
      await db.workoutLogExercises.update(ex.id, { sets: undefined, reps: undefined, weightKg: undefined } as never)
    }
  })
}

/**
 * Tabellen, die nicht ins JSON-Backup gehören.
 *
 * `backgroundPhoto` hält einen rohen Blob - `JSON.stringify` macht daraus `{}`, und beim
 * Zurückspielen landete dieses leere Objekt als Foto in der Datenbank, woran der
 * Hintergrund-Layer beim Rendern scheiterte. `progressPhotos` ist ein Altbestand aus
 * Schema-Version 1 ohne Typ und ohne Nutzung.
 */
const BACKUP_EXCLUDED_TABLES = ['backgroundPhoto', 'progressPhotos']

function backupTables() {
  return db.tables.filter((table) => !BACKUP_EXCLUDED_TABLES.includes(table.name))
}

export async function exportAllData(): Promise<string> {
  const data: Record<string, unknown[]> = {}
  for (const table of backupTables()) {
    data[table.name] = await table.toArray()
  }
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data })
}

/**
 * Stammdaten-Tabellen und die Felder, die auf sie verweisen. Grundlage von
 * `resolveReferencesByName` - und damit die Liste der Stellen, an denen ein Import sonst
 * Doppelgänger erzeugen würde.
 */
const REFERENCE_TABLES: { table: string; references: { table: string; field: string }[] }[] = [
  {
    table: 'foodItems',
    references: [
      { table: 'planMeals', field: 'foodItemId' },
      { table: 'nutritionLogItems', field: 'foodItemId' },
    ],
  },
  {
    table: 'exercises',
    references: [
      { table: 'trainingPlanExercises', field: 'exerciseId' },
      { table: 'workoutLogExercises', field: 'exerciseId' },
    ],
  },
  {
    table: 'supplements',
    references: [{ table: 'supplementPlanItems', field: 'supplementId' }],
  },
]

/**
 * Bindet die Stammdaten einer Import-Datei an den vorhandenen Bestand.
 *
 * IDs werden pro Browser-Profil zufällig vergeben: "Haferflocken" hat auf dem iPhone eine andere
 * ID als auf dem Rechner, obwohl beide Geräte dasselbe Lebensmittel meinen. Ein Import, der Zeilen
 * nur über die ID zusammenführt (`bulkPut`), legt deshalb die komplette Lebensmittel-, Übungs- und
 * Supplement-Datenbank ein zweites Mal an - genau daher stammen die doppelten Einträge.
 *
 * Hier bekommt jede Zeile, deren Name schon existiert, die vorhandene ID; die Werte aus der Datei
 * bleiben erhalten (ein Backup einzuspielen soll den gesicherten Stand herstellen). Die Verweise
 * der importierten Pläne und Logs werden entsprechend umgeschrieben.
 */
async function resolveReferencesByName(
  data: Record<string, Record<string, unknown>[]>,
): Promise<Record<string, Record<string, unknown>[]>> {
  const resolved = { ...data }

  for (const { table, references } of REFERENCE_TABLES) {
    const rows = resolved[table]
    if (!rows || rows.length === 0) continue

    const existing = byName((await db.table(table).toArray()) as { id: string; name: string }[])
    const remap = new Map<string, string>()
    resolved[table] = rows.map((row) => {
      const name = typeof row.name === 'string' ? row.name : ''
      const match = name ? existing.get(nameKey(name)) : undefined
      if (!match || match.id === row.id) return row
      remap.set(row.id as string, match.id)
      return { ...row, id: match.id }
    })
    if (remap.size === 0) continue

    for (const reference of references) {
      const referencing = resolved[reference.table]
      if (!referencing) continue
      resolved[reference.table] = referencing.map((row) => {
        const target = remap.get(row[reference.field] as string)
        return target === undefined ? row : { ...row, [reference.field]: target }
      })
    }
  }

  return resolved
}

/**
 * Spielt ein Backup ein. Zeilen mit gleicher ID werden überschrieben, Stammdaten zusätzlich über
 * ihren Namen an den vorhandenen Bestand gebunden (siehe `resolveReferencesByName`).
 *
 * Für den Rest (mehrfach vorhandene Tage, gleichnamige Plan-Phasen) gibt es `dedupeDatabase` -
 * die Oberfläche ruft es direkt nach dem Import auf.
 */
export async function importAllData(json: string): Promise<void> {
  const parsed = JSON.parse(json) as { data: Record<string, Record<string, unknown>[]> }
  const data = await resolveReferencesByName(parsed.data)
  const tables = backupTables()
  await db.transaction('rw', tables, async () => {
    for (const table of tables) {
      const rows = data[table.name]
      if (!rows) continue
      await table.bulkPut(rows)
    }
  })
}

// Filtert ein vollständiges Backup-`data`-Objekt (gleiche Struktur wie exportAllData/
// importAllData) auf nur die zu den angegebenen Athleten gehörenden Zeilen - direkt über
// athleteId, transitiv über planId/workoutLogId/nutritionLogId für die jeweils
// abhängigen Tabellen. Globale Referenztabellen (foodItems/supplements/exercises) werden
// unverändert komplett durchgereicht; sie werden beim Import über `resolveReferencesByName`
// an den vorhandenen Bestand gebunden, statt als Doppelgänger neu anzulegen.
function filterDataToAthletes(data: Record<string, Record<string, unknown>[]>, athleteIds: string[]): Record<string, Record<string, unknown>[]> {
  const athleteIdSet = new Set(athleteIds)
  const byAthlete = (rows: Record<string, unknown>[] | undefined) => (rows ?? []).filter((r) => athleteIdSet.has(r.athleteId as string))

  const athletes = (data.athletes ?? []).filter((a) => athleteIdSet.has(a.id as string))
  const dailyEntries = byAthlete(data.dailyEntries)
  const nutritionPlans = byAthlete(data.nutritionPlans)
  const supplementPlans = byAthlete(data.supplementPlans)
  const trainingPlans = byAthlete(data.trainingPlans)
  const workoutLogs = byAthlete(data.workoutLogs)
  const nutritionLogs = byAthlete(data.nutritionLogs)

  const nutritionPlanIds = new Set(nutritionPlans.map((p) => p.id))
  const planMeals = (data.planMeals ?? []).filter((m) => nutritionPlanIds.has(m.planId))

  const supplementPlanIds = new Set(supplementPlans.map((p) => p.id))
  const supplementPlanItems = (data.supplementPlanItems ?? []).filter((i) => supplementPlanIds.has(i.planId))

  const trainingPlanIds = new Set(trainingPlans.map((p) => p.id))
  const trainingPlanExercises = (data.trainingPlanExercises ?? []).filter((e) => trainingPlanIds.has(e.planId))

  const workoutLogIds = new Set(workoutLogs.map((w) => w.id))
  const workoutLogExercises = (data.workoutLogExercises ?? []).filter((e) => workoutLogIds.has(e.workoutLogId))

  const workoutLogExerciseIds = new Set(workoutLogExercises.map((e) => e.id))
  const workoutSets = (data.workoutSets ?? []).filter((s) => workoutLogExerciseIds.has(s.workoutLogExerciseId))

  const nutritionLogIds = new Set(nutritionLogs.map((n) => n.id))
  const nutritionLogItems = (data.nutritionLogItems ?? []).filter((i) => nutritionLogIds.has(i.nutritionLogId))

  return {
    athletes,
    dailyEntries,
    nutritionPlans,
    planMeals,
    supplementPlans,
    supplementPlanItems,
    trainingPlans,
    trainingPlanExercises,
    workoutLogs,
    workoutLogExercises,
    workoutSets,
    nutritionLogs,
    nutritionLogItems,
    foodItems: data.foodItems ?? [],
    supplements: data.supplements ?? [],
    exercises: data.exercises ?? [],
  }
}

export async function exportAthletes(athleteIds: string[]): Promise<string> {
  const full = JSON.parse(await exportAllData()) as { data: Record<string, Record<string, unknown>[]> }
  const filtered = filterDataToAthletes(full.data, athleteIds)
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data: filtered })
}

export async function importSelectedAthletes(json: string, athleteIds: string[]): Promise<void> {
  const parsed = JSON.parse(json) as { data: Record<string, Record<string, unknown>[]> }
  const filtered = await resolveReferencesByName(filterDataToAthletes(parsed.data, athleteIds))
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      const rows = filtered[table.name]
      if (!rows) continue
      await table.bulkPut(rows)
    }
  })
}

// Plan-Vorlagen (einzelne Phase/Tag) als portables JSON exportieren/importieren.
// Referenzen (Lebensmittel/Supplemente/Übungen) werden über den Namen aufgelöst, da
// IDs pro Browser-Profil zufällig generiert werden und daher nicht athletenübergreifend
// gültig sind - Fallback-Daten im Export erlauben das Neuanlegen im Ziel-Datenbestand.

interface NutritionPlanTemplate {
  kind: 'nutritionPlan'
  version: 1
  phaseName: string
  items: { mealType: MealType; grams: number; foodName: string; foodMacros?: Omit<FoodItem, 'id' | 'name'> }[]
}

export async function exportNutritionPlan(planId: string): Promise<string> {
  const plan = await db.nutritionPlans.get(planId)
  if (!plan) throw new Error('Plan nicht gefunden')
  const meals = await db.planMeals.where('planId').equals(planId).sortBy('order')
  const foods = await db.foodItems.bulkGet(meals.map((m) => m.foodItemId))
  const template: NutritionPlanTemplate = {
    kind: 'nutritionPlan',
    version: 1,
    phaseName: plan.phaseName,
    items: meals.map((m, i) => {
      const food = foods[i]
      return {
        mealType: m.mealType,
        grams: m.grams,
        foodName: food?.name ?? '?',
        foodMacros: food ? { kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat } : undefined,
      }
    }),
  }
  return JSON.stringify(template)
}

export async function importNutritionPlan(json: string, athleteId: string): Promise<string> {
  const template = JSON.parse(json) as NutritionPlanTemplate
  if (template.kind !== 'nutritionPlan') throw new Error('Ungültige Vorlagen-Datei (kein Ernährungsplan)')
  const planId = crypto.randomUUID()
  await db.transaction('rw', db.nutritionPlans, db.planMeals, db.foodItems, async () => {
    const order = await db.nutritionPlans.where('athleteId').equals(athleteId).count()
    await db.nutritionPlans.add({ id: planId, athleteId, phaseName: template.phaseName, order })
    // Einmal nachschlagen statt je Zeile: über `nameKey` und nicht über den Index, sonst gilt
    // "Reis (roh)" gegen "reis (roh)" als unbekannt und wird ein zweites Mal angelegt.
    const foods = byName(await db.foodItems.toArray())
    for (const [index, item] of template.items.entries()) {
      let food = foods.get(nameKey(item.foodName))
      if (!food && item.foodMacros) {
        food = { id: crypto.randomUUID(), name: item.foodName, ...item.foodMacros }
        await db.foodItems.add(food)
        foods.set(nameKey(item.foodName), food)
      }
      if (!food) continue
      await db.planMeals.add({
        id: crypto.randomUUID(),
        planId,
        mealType: item.mealType,
        foodItemId: food.id,
        grams: item.grams,
        order: index,
      })
    }
  })
  return planId
}

interface SupplementPlanTemplate {
  kind: 'supplementPlan'
  version: 1
  phaseName: string
  items: {
    supplementName: string
    supplementFallback?: Omit<Supplement, 'id' | 'name'>
    dose: string
    timing: SupplementTiming
    notes?: string
  }[]
}

export async function exportSupplementPlan(planId: string): Promise<string> {
  const plan = await db.supplementPlans.get(planId)
  if (!plan) throw new Error('Plan nicht gefunden')
  const items = await db.supplementPlanItems.where('planId').equals(planId).sortBy('order')
  const supplements = await db.supplements.bulkGet(items.map((i) => i.supplementId))
  const template: SupplementPlanTemplate = {
    kind: 'supplementPlan',
    version: 1,
    phaseName: plan.phaseName,
    items: items.map((i, idx) => {
      const supplement = supplements[idx]
      return {
        supplementName: supplement?.name ?? '?',
        supplementFallback: supplement
          ? { defaultDose: supplement.defaultDose, defaultTiming: supplement.defaultTiming, notes: supplement.notes }
          : undefined,
        dose: i.dose,
        timing: i.timing,
        notes: i.notes,
      }
    }),
  }
  return JSON.stringify(template)
}

export async function importSupplementPlan(json: string, athleteId: string): Promise<string> {
  const template = JSON.parse(json) as SupplementPlanTemplate
  if (template.kind !== 'supplementPlan') throw new Error('Ungültige Vorlagen-Datei (kein Supplementplan)')
  const planId = crypto.randomUUID()
  await db.transaction('rw', db.supplementPlans, db.supplementPlanItems, db.supplements, async () => {
    const order = await db.supplementPlans.where('athleteId').equals(athleteId).count()
    await db.supplementPlans.add({ id: planId, athleteId, phaseName: template.phaseName, order })
    const supplements = byName(await db.supplements.toArray())
    let itemOrder = 0
    for (const item of template.items) {
      let supplement = supplements.get(nameKey(item.supplementName))
      if (!supplement && item.supplementFallback) {
        supplement = { id: crypto.randomUUID(), name: item.supplementName, ...item.supplementFallback }
        await db.supplements.add(supplement)
        supplements.set(nameKey(item.supplementName), supplement)
      }
      if (!supplement) continue
      await db.supplementPlanItems.add({
        id: crypto.randomUUID(),
        planId,
        supplementId: supplement.id,
        dose: item.dose,
        timing: item.timing,
        notes: item.notes,
        order: itemOrder++,
      })
    }
  })
  return planId
}

interface TrainingPlanTemplate {
  kind: 'trainingPlan'
  version: 1
  phaseName: string
  items: {
    exerciseName: string
    exerciseFallback?: { muscleGroup: MuscleGroup; imageDataUrl?: string }
    order: number
    sets: number
    reps: string
    targetWeightKg?: number
    notes?: string
  }[]
}

export async function exportTrainingPlan(planId: string): Promise<string> {
  const plan = await db.trainingPlans.get(planId)
  if (!plan) throw new Error('Plan nicht gefunden')
  const rows = await db.trainingPlanExercises.where('planId').equals(planId).sortBy('order')
  const exercises = await db.exercises.bulkGet(rows.map((r) => r.exerciseId))
  const template: TrainingPlanTemplate = {
    kind: 'trainingPlan',
    version: 1,
    phaseName: plan.phaseName,
    items: rows.map((r, i) => {
      const exercise = exercises[i]
      return {
        exerciseName: exercise?.name ?? '?',
        exerciseFallback: exercise ? { muscleGroup: exercise.muscleGroup, imageDataUrl: exercise.imageDataUrl } : undefined,
        order: r.order,
        sets: r.sets,
        reps: r.reps,
        targetWeightKg: r.targetWeightKg,
        notes: r.notes,
      }
    }),
  }
  return JSON.stringify(template)
}

export async function importTrainingPlan(json: string, athleteId: string): Promise<string> {
  const template = JSON.parse(json) as TrainingPlanTemplate
  if (template.kind !== 'trainingPlan') throw new Error('Ungültige Vorlagen-Datei (kein Trainingsplan)')
  const planId = crypto.randomUUID()
  await db.transaction('rw', db.trainingPlans, db.trainingPlanExercises, db.exercises, async () => {
    const order = await db.trainingPlans.where('athleteId').equals(athleteId).count()
    await db.trainingPlans.add({ id: planId, athleteId, phaseName: template.phaseName, order })
    const exercises = byName(await db.exercises.toArray())
    for (const item of template.items) {
      let exercise = exercises.get(nameKey(item.exerciseName))
      if (!exercise && item.exerciseFallback) {
        exercise = { id: crypto.randomUUID(), name: item.exerciseName, ...item.exerciseFallback }
        await db.exercises.add(exercise)
        exercises.set(nameKey(item.exerciseName), exercise)
      }
      if (!exercise) continue
      await db.trainingPlanExercises.add({
        id: crypto.randomUUID(),
        planId,
        exerciseId: exercise.id,
        order: item.order,
        sets: item.sets,
        reps: item.reps,
        targetWeightKg: item.targetWeightKg,
        notes: item.notes,
      })
    }
  })
  return planId
}
