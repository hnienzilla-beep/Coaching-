import { db } from './db'
import { nameKey } from '../lib/names'
import type {
  Athlete,
  DailyEntry,
  Exercise,
  FoodItem,
  NutritionLog,
  NutritionLogItem,
  NutritionPlan,
  PlanMeal,
  Supplement,
  SupplementPlan,
  SupplementPlanItem,
  TrainingPlan,
  TrainingPlanExercise,
  WorkoutLog,
  WorkoutLogExercise,
  WorkoutSet,
} from '../models/types'

/**
 * Zusammenführen doppelter Datensätze.
 *
 * Woher die Doppelgänger kommen: Alle Import-Wege der App (Backup einspielen, Athleten aus
 * einer Datei übernehmen, Backup aus dem Vault wiederherstellen) haben Zeilen bisher allein über
 * ihre ID zusammengeführt (`bulkPut`). IDs sind aber pro Browser-Profil zufällig - ein Backup vom
 * iPhone kennt für "Haferflocken" eine andere ID als das frisch aufgesetzte Gerät, auf dem die
 * Startdaten schon angelegt wurden. Ergebnis: Nach jedem solchen Import steht die komplette
 * Lebensmittel-, Übungs- und Supplement-Datenbank ein zweites Mal in der App, samt der daran
 * hängenden Pläne und Tageseinträge.
 *
 * Was hier passiert:
 * - Stammdaten (Lebensmittel, Übungen, Supplemente) werden über den Namen zusammengeführt, alle
 *   Verweise darauf umgehängt.
 * - Tageszeilen (Tracking, Trainingslog, Ernährungslog) gibt es je Athlet und Tag nur einmal;
 *   mehrere werden zu einer verschmolzen, leere Felder dabei aus den Doppelgängern gefüllt.
 * - Plan-Phasen mit gleichem Namen werden je Athlet zusammengelegt, ihre Zeilen umgehängt.
 * - Kind-Zeilen, die danach in jedem Feld übereinstimmen (gleiche Mahlzeit, gleiches Lebensmittel,
 *   gleiche Menge), sind in der Oberfläche nicht unterscheidbar - davon bleibt eine übrig.
 *
 * Gelöscht wird nur, was nachweislich doppelt ist: Ein Datensatz ohne Doppelgänger wird nie
 * angefasst, und beim Verschmelzen gewinnt immer der Datensatz mit den meisten Daten.
 */

export interface DedupeSnapshot {
  athletes: Athlete[]
  dailyEntries: DailyEntry[]
  nutritionPlans: NutritionPlan[]
  planMeals: PlanMeal[]
  supplementPlans: SupplementPlan[]
  supplementPlanItems: SupplementPlanItem[]
  trainingPlans: TrainingPlan[]
  trainingPlanExercises: TrainingPlanExercise[]
  workoutLogs: WorkoutLog[]
  workoutLogExercises: WorkoutLogExercise[]
  workoutSets: WorkoutSet[]
  nutritionLogs: NutritionLog[]
  nutritionLogItems: NutritionLogItem[]
  foodItems: FoodItem[]
  supplements: Supplement[]
  exercises: Exercise[]
}

export type DedupeTable = keyof DedupeSnapshot

export const DEDUPE_TABLES: DedupeTable[] = [
  'athletes',
  'dailyEntries',
  'nutritionPlans',
  'planMeals',
  'supplementPlans',
  'supplementPlanItems',
  'trainingPlans',
  'trainingPlanExercises',
  'workoutLogs',
  'workoutLogExercises',
  'workoutSets',
  'nutritionLogs',
  'nutritionLogItems',
  'foodItems',
  'supplements',
  'exercises',
]

/** Anzahl entfernter Doppelgänger je Tabelle - alles, was nicht doppelt war, taucht nicht auf. */
export type DedupeReport = Partial<Record<DedupeTable, number>>

export interface DedupeResult {
  /** Zeilen, die neu geschrieben werden müssen (verschmolzen, umgehängt, neu sortiert). */
  updated: Partial<Record<DedupeTable, Record<string, unknown>[]>>
  /** IDs der entfernten Doppelgänger je Tabelle. */
  removed: Partial<Record<DedupeTable, string[]>>
  report: DedupeReport
  /** Athleten, die zusammengeführt wurden - für die Rückfrage vor dem Bereinigen. */
  mergedAthleteNames: string[]
}

export interface DedupeOptions {
  /**
   * Athleten mit gleichem Namen zusammenführen (samt ihrer Tage und Pläne).
   *
   * Standardmäßig aus: Zwei Athleten desselben Namens können auch zwei verschiedene Personen
   * sein, und ein Zusammenführen mischt deren Trainings- und Ernährungsdaten. Das passiert
   * deshalb nur auf ausdrücklichen Wunsch (Schaltfläche in der Athletenverwaltung), nicht
   * automatisch beim Start oder nach einem Import.
   */
  mergeAthletes?: boolean
}

export function summarizeDedupe(report: DedupeReport): string | null {
  const labels: Partial<Record<DedupeTable, string>> = {
    athletes: 'Athleten',
    dailyEntries: 'Tracking-Tage',
    nutritionPlans: 'Ernährungsplan-Phasen',
    planMeals: 'Plan-Mahlzeiten',
    supplementPlans: 'Supplementplan-Phasen',
    supplementPlanItems: 'Supplement-Einträge',
    trainingPlans: 'Trainingsplan-Phasen',
    trainingPlanExercises: 'Plan-Übungen',
    workoutLogs: 'Trainingstage',
    workoutLogExercises: 'Log-Übungen',
    workoutSets: 'Sätze',
    nutritionLogs: 'Ernährungstage',
    nutritionLogItems: 'Log-Mahlzeiten',
    foodItems: 'Lebensmittel',
    supplements: 'Supplemente',
    exercises: 'Übungen',
  }
  const parts = DEDUPE_TABLES.filter((table) => (report[table] ?? 0) > 0).map(
    (table) => `${labels[table] ?? table}: ${report[table]}`,
  )
  return parts.length > 0 ? parts.join(', ') : null
}

export function dedupeTotal(report: DedupeReport): number {
  return DEDUPE_TABLES.reduce((sum, table) => sum + (report[table] ?? 0), 0)
}

// ------------------------------------------------------------------ Bausteine

interface Row {
  id: string
}

/**
 * Führt Zeilen mit gleichem Schlüssel zusammen.
 *
 * Überlebender ist die Zeile mit dem höchsten `rank` (bei Gleichstand die erste - die Reihenfolge
 * aus der Datenbank ist stabil, damit ist auch das Ergebnis reproduzierbar). `inherit` darf dem
 * Überlebenden Felder der Doppelgänger nachtragen; ein Schlüssel `null` heißt "nicht vergleichbar"
 * und lässt die Zeile unangetastet.
 */
function mergeRows<T extends Row>(
  rows: T[],
  key: (row: T) => string | null,
  rank: (row: T) => number,
  inherit?: (winner: T, loser: T) => T,
): { rows: T[]; remap: Map<string, string>; removed: string[]; changed: Set<string> } {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const groupKey = key(row)
    // Ohne Schlüssel (z.B. eine noch namenlose Zeile) gibt es nichts zu vergleichen - die Zeile
    // läuft unverändert durch.
    if (groupKey === null) continue
    const group = groups.get(groupKey)
    if (group) group.push(row)
    else groups.set(groupKey, [row])
  }

  const remap = new Map<string, string>()
  const removed: string[] = []
  const changed = new Set<string>()
  const survivors = new Map<string, T>()

  for (const group of groups.values()) {
    let winner = group[0]
    for (const candidate of group) {
      if (rank(candidate) > rank(winner)) winner = candidate
    }
    for (const loser of group) {
      if (loser.id === winner.id) continue
      remap.set(loser.id, winner.id)
      removed.push(loser.id)
      if (inherit) {
        const merged = inherit(winner, loser)
        if (merged !== winner) {
          winner = merged
          changed.add(winner.id)
        }
      }
    }
    survivors.set(winner.id, winner)
  }

  // Ursprüngliche Reihenfolge beibehalten, damit sich aus einem Durchlauf ohne Funde auch
  // wirklich keine Schreibvorgänge ergeben.
  const result: T[] = []
  for (const row of rows) {
    if (remap.has(row.id)) continue
    result.push(survivors.get(row.id) ?? row)
  }
  return { rows: result, remap, removed, changed }
}

/** Hängt Verweise (`foodItemId`, `planId`, `athleteId` …) auf den überlebenden Datensatz um. */
function remapField<T extends Row>(rows: T[], field: keyof T, remap: Map<string, string>, changed: Set<string>): T[] {
  if (remap.size === 0) return rows
  return rows.map((row) => {
    const target = remap.get(row[field] as unknown as string)
    if (target === undefined) return row
    changed.add(row.id)
    return { ...row, [field]: target }
  })
}

/**
 * Entfernt Kind-Zeilen, die innerhalb desselben Eltern-Datensatzes in jedem Feld übereinstimmen.
 *
 * `order` bleibt beim Vergleich außen vor: Zwei gleiche Mahlzeiten an Position 3 und 7 sind
 * derselbe Eintrag, nur an anderer Stelle einsortiert.
 */
function removeIdenticalChildren<T extends Row>(
  rows: T[],
  contentKey: (row: T) => string,
): { rows: T[]; removed: string[] } {
  const seen = new Set<string>()
  const kept: T[] = []
  const removed: string[] = []
  for (const row of rows) {
    const key = contentKey(row)
    if (seen.has(key)) {
      removed.push(row.id)
      continue
    }
    seen.add(key)
    kept.push(row)
  }
  return { rows: kept, removed }
}

/** Lückenlose `order`-Werte je Eltern-Datensatz, in der bisherigen Reihenfolge. */
function renumberOrder<T extends Row & { order: number }>(
  rows: T[],
  parentOf: (row: T) => string,
  changed: Set<string>,
): T[] {
  const byParent = new Map<string, T[]>()
  for (const row of rows) {
    const list = byParent.get(parentOf(row))
    if (list) list.push(row)
    else byParent.set(parentOf(row), [row])
  }
  const next = new Map<string, number>()
  for (const [, list] of byParent) {
    const sorted = [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    for (let i = 0; i < sorted.length; i++) next.set(sorted[i].id, i)
  }
  return rows.map((row) => {
    const order = next.get(row.id)
    if (order === undefined || order === row.order) return row
    changed.add(row.id)
    return { ...row, order }
  })
}

function countBy<T>(rows: T[], keyOf: (row: T) => string | undefined): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = keyOf(row)
    if (key === undefined) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/** Anzahl gesetzter Felder - Maßstab dafür, welche von zwei Zeilen die vollständigere ist. */
function filledFields(row: Record<string, unknown>, fields: string[]): number {
  return fields.filter((field) => row[field] !== undefined && row[field] !== '').length
}

/** Trägt dem Gewinner die Felder nach, die bei ihm fehlen. Unverändert = dasselbe Objekt. */
function fillMissing<T extends Row>(winner: T, loser: T, fields: (keyof T)[]): T {
  let merged: T | null = null
  for (const field of fields) {
    const winnerValue = winner[field]
    const loserValue = loser[field]
    if (winnerValue !== undefined && winnerValue !== '') continue
    if (loserValue === undefined || loserValue === '') continue
    merged = { ...(merged ?? winner), [field]: loserValue }
  }
  return merged ?? winner
}

const TRACKING_FIELDS: (keyof DailyEntry)[] = [
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
]

// -------------------------------------------------------------- Bereinigungslauf

/**
 * Rechnet die Bereinigung auf einem Abzug der Datenbank durch - ohne Seiteneffekte, damit sich
 * das Verhalten testen lässt und der Schreibvorgang nur noch das Ergebnis anwenden muss.
 */
export function planDedupe(snapshot: DedupeSnapshot, options: DedupeOptions = {}): DedupeResult {
  const changed: Record<DedupeTable, Set<string>> = {
    athletes: new Set(),
    dailyEntries: new Set(),
    nutritionPlans: new Set(),
    planMeals: new Set(),
    supplementPlans: new Set(),
    supplementPlanItems: new Set(),
    trainingPlans: new Set(),
    trainingPlanExercises: new Set(),
    workoutLogs: new Set(),
    workoutLogExercises: new Set(),
    workoutSets: new Set(),
    nutritionLogs: new Set(),
    nutritionLogItems: new Set(),
    foodItems: new Set(),
    supplements: new Set(),
    exercises: new Set(),
  }
  const removed: Record<DedupeTable, string[]> = {
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
  }

  const next: DedupeSnapshot = { ...snapshot }
  const mergedAthleteNames: string[] = []

  // 1. Stammdaten über den Namen zusammenführen. Überlebender ist der Datensatz, auf den die
  //    meisten Pläne und Logs verweisen - so bleiben möglichst viele Verweise unverändert.
  const foodUses = countBy(
    [...next.planMeals, ...next.nutritionLogItems],
    (row) => (row as { foodItemId?: string }).foodItemId,
  )
  const food = mergeRows(
    next.foodItems,
    (row) => (row.name.trim() ? nameKey(row.name) : null),
    (row) => (foodUses.get(row.id) ?? 0) * 10 + (row.unconfirmed ? 0 : 1),
    (winner, loser) => {
      const merged = fillMissing(winner, loser, ['kcal', 'protein', 'carbs', 'fat'])
      // Ein Favorit bleibt Favorit; "unbestätigt" fällt weg, sobald eine der Zeilen bestätigt ist.
      const favorite = winner.favorite || loser.favorite || undefined
      const unconfirmed = winner.unconfirmed && loser.unconfirmed ? true : undefined
      if (favorite === merged.favorite && unconfirmed === merged.unconfirmed) return merged
      return { ...merged, favorite, unconfirmed }
    },
  )
  next.foodItems = food.rows
  removed.foodItems = food.removed
  for (const id of food.changed) changed.foodItems.add(id)

  const exerciseUses = countBy(
    [...next.trainingPlanExercises, ...next.workoutLogExercises],
    (row) => (row as { exerciseId?: string }).exerciseId,
  )
  const exercise = mergeRows(
    next.exercises,
    (row) => (row.name.trim() ? nameKey(row.name) : null),
    (row) => (exerciseUses.get(row.id) ?? 0) * 10 + (row.muscleGroup !== 'Sonstiges' ? 1 : 0),
    (winner, loser) => {
      const merged = fillMissing(winner, loser, ['imageDataUrl'])
      // Der Vault-Import legt unbekannte Übungen als "Sonstiges" an - eine echte Muskelgruppe
      // aus dem Doppelgänger ist die bessere Angabe.
      const muscleGroup = merged.muscleGroup === 'Sonstiges' ? loser.muscleGroup : merged.muscleGroup
      const favorite = winner.favorite || loser.favorite || undefined
      if (muscleGroup === merged.muscleGroup && favorite === merged.favorite) return merged
      return { ...merged, muscleGroup, favorite }
    },
  )
  next.exercises = exercise.rows
  removed.exercises = exercise.removed
  for (const id of exercise.changed) changed.exercises.add(id)

  const supplementUses = countBy(next.supplementPlanItems, (row) => row.supplementId)
  const supplement = mergeRows(
    next.supplements,
    (row) => (row.name.trim() ? nameKey(row.name) : null),
    (row) => (supplementUses.get(row.id) ?? 0) * 10 + (row.defaultDose ? 1 : 0),
    (winner, loser) => fillMissing(winner, loser, ['defaultDose', 'notes']),
  )
  next.supplements = supplement.rows
  removed.supplements = supplement.removed
  for (const id of supplement.changed) changed.supplements.add(id)

  next.planMeals = remapField(next.planMeals, 'foodItemId', food.remap, changed.planMeals)
  next.nutritionLogItems = remapField(next.nutritionLogItems, 'foodItemId', food.remap, changed.nutritionLogItems)
  next.trainingPlanExercises = remapField(
    next.trainingPlanExercises,
    'exerciseId',
    exercise.remap,
    changed.trainingPlanExercises,
  )
  next.workoutLogExercises = remapField(next.workoutLogExercises, 'exerciseId', exercise.remap, changed.workoutLogExercises)
  next.supplementPlanItems = remapField(
    next.supplementPlanItems,
    'supplementId',
    supplement.remap,
    changed.supplementPlanItems,
  )

  // 2. Athleten - nur auf ausdrücklichen Wunsch, siehe DedupeOptions.
  if (options.mergeAthletes) {
    const entryCounts = countBy(
      [...next.dailyEntries, ...next.workoutLogs, ...next.nutritionLogs],
      (row) => (row as { athleteId?: string }).athleteId,
    )
    const athlete = mergeRows(
      next.athletes,
      (row) => (row.name.trim() ? nameKey(row.name) : null),
      (row) => entryCounts.get(row.id) ?? 0,
      (winner, loser) => fillMissing(winner, loser, ['targetWeightKg', 'targetDate', 'ffmi', 'calorieAdjustmentKcal']),
    )
    for (const loserId of athlete.removed) {
      const name = snapshot.athletes.find((a) => a.id === loserId)?.name
      if (name && !mergedAthleteNames.includes(name)) mergedAthleteNames.push(name)
    }
    next.athletes = athlete.rows
    removed.athletes = athlete.removed
    for (const id of athlete.changed) changed.athletes.add(id)

    next.dailyEntries = remapField(next.dailyEntries, 'athleteId', athlete.remap, changed.dailyEntries)
    next.nutritionPlans = remapField(next.nutritionPlans, 'athleteId', athlete.remap, changed.nutritionPlans)
    next.supplementPlans = remapField(next.supplementPlans, 'athleteId', athlete.remap, changed.supplementPlans)
    next.trainingPlans = remapField(next.trainingPlans, 'athleteId', athlete.remap, changed.trainingPlans)
    next.workoutLogs = remapField(next.workoutLogs, 'athleteId', athlete.remap, changed.workoutLogs)
    next.nutritionLogs = remapField(next.nutritionLogs, 'athleteId', athlete.remap, changed.nutritionLogs)
  }

  // 3. Ein Tracking-Eintrag je Athlet und Tag; fehlende Werte kommen aus den Doppelgängern.
  const dailyEntry = mergeRows(
    next.dailyEntries,
    (row) => `${row.athleteId}|${row.date}`,
    (row) => filledFields(row as unknown as Record<string, unknown>, TRACKING_FIELDS as string[]),
    (winner, loser) => fillMissing(winner, loser, TRACKING_FIELDS),
  )
  next.dailyEntries = dailyEntry.rows
  removed.dailyEntries = dailyEntry.removed
  for (const id of dailyEntry.changed) changed.dailyEntries.add(id)

  // 4. Plan-Phasen je Athlet und Name, Tageslogs je Athlet und Datum. Die Kind-Zeilen der
  //    Doppelgänger werden umgehängt statt gelöscht - Schritt 5 räumt danach auf.
  const planMealCounts = countBy(next.planMeals, (row) => row.planId)
  const nutritionPlan = mergeRows(
    next.nutritionPlans,
    (row) => `${row.athleteId}|${nameKey(row.phaseName)}`,
    (row) => planMealCounts.get(row.id) ?? 0,
  )
  next.nutritionPlans = nutritionPlan.rows
  removed.nutritionPlans = nutritionPlan.removed
  next.planMeals = remapField(next.planMeals, 'planId', nutritionPlan.remap, changed.planMeals)
  next.nutritionLogs = remapField(next.nutritionLogs, 'nutritionPlanId', nutritionPlan.remap, changed.nutritionLogs)

  const supplementItemCounts = countBy(next.supplementPlanItems, (row) => row.planId)
  const supplementPlan = mergeRows(
    next.supplementPlans,
    (row) => `${row.athleteId}|${nameKey(row.phaseName)}`,
    (row) => supplementItemCounts.get(row.id) ?? 0,
  )
  next.supplementPlans = supplementPlan.rows
  removed.supplementPlans = supplementPlan.removed
  next.supplementPlanItems = remapField(
    next.supplementPlanItems,
    'planId',
    supplementPlan.remap,
    changed.supplementPlanItems,
  )

  const planExerciseCounts = countBy(next.trainingPlanExercises, (row) => row.planId)
  const trainingPlan = mergeRows(
    next.trainingPlans,
    (row) => `${row.athleteId}|${nameKey(row.phaseName)}`,
    (row) => planExerciseCounts.get(row.id) ?? 0,
  )
  next.trainingPlans = trainingPlan.rows
  removed.trainingPlans = trainingPlan.removed
  next.trainingPlanExercises = remapField(
    next.trainingPlanExercises,
    'planId',
    trainingPlan.remap,
    changed.trainingPlanExercises,
  )
  next.workoutLogs = remapField(next.workoutLogs, 'trainingPlanId', trainingPlan.remap, changed.workoutLogs)

  const logExerciseCounts = countBy(next.workoutLogExercises, (row) => row.workoutLogId)
  const workoutLog = mergeRows(
    next.workoutLogs,
    (row) => `${row.athleteId}|${row.date}`,
    (row) => logExerciseCounts.get(row.id) ?? 0,
    (winner, loser) => fillMissing(winner, loser, ['trainingPlanId', 'notes', 'startedAt', 'completedAt']),
  )
  next.workoutLogs = workoutLog.rows
  removed.workoutLogs = workoutLog.removed
  for (const id of workoutLog.changed) changed.workoutLogs.add(id)
  next.workoutLogExercises = remapField(
    next.workoutLogExercises,
    'workoutLogId',
    workoutLog.remap,
    changed.workoutLogExercises,
  )

  const logItemCounts = countBy(next.nutritionLogItems, (row) => row.nutritionLogId)
  const nutritionLog = mergeRows(
    next.nutritionLogs,
    (row) => `${row.athleteId}|${row.date}`,
    (row) => logItemCounts.get(row.id) ?? 0,
    (winner, loser) => fillMissing(winner, loser, ['nutritionPlanId', 'notes', 'completedAt']),
  )
  next.nutritionLogs = nutritionLog.rows
  removed.nutritionLogs = nutritionLog.removed
  for (const id of nutritionLog.changed) changed.nutritionLogs.add(id)
  next.nutritionLogItems = remapField(
    next.nutritionLogItems,
    'nutritionLogId',
    nutritionLog.remap,
    changed.nutritionLogItems,
  )

  // 5. Kind-Zeilen, die jetzt in jedem Feld übereinstimmen, gibt es nur noch einmal.
  const planMealsDeduped = removeIdenticalChildren(
    next.planMeals,
    (row) => `${row.planId}|${row.mealType}|${row.foodItemId}|${row.grams}`,
  )
  next.planMeals = planMealsDeduped.rows
  removed.planMeals = planMealsDeduped.removed

  const supplementItemsDeduped = removeIdenticalChildren(
    next.supplementPlanItems,
    (row) => `${row.planId}|${row.supplementId}|${row.dose}|${row.timing}|${row.notes ?? ''}`,
  )
  next.supplementPlanItems = supplementItemsDeduped.rows
  removed.supplementPlanItems = supplementItemsDeduped.removed

  const planExercisesDeduped = removeIdenticalChildren(
    next.trainingPlanExercises,
    (row) => `${row.planId}|${row.exerciseId}|${row.sets}|${row.reps}|${row.targetWeightKg ?? ''}|${row.notes ?? ''}`,
  )
  next.trainingPlanExercises = planExercisesDeduped.rows
  removed.trainingPlanExercises = planExercisesDeduped.removed

  const logItemsDeduped = removeIdenticalChildren(
    next.nutritionLogItems,
    (row) => `${row.nutritionLogId}|${row.mealType}|${row.foodItemId}|${row.grams}|${row.done ? '1' : '0'}`,
  )
  next.nutritionLogItems = logItemsDeduped.rows
  removed.nutritionLogItems = logItemsDeduped.removed

  // Sätze zuerst: Eine Übungszeile im Log ist erst dann ein Doppelgänger, wenn auch ihre Sätze
  // übereinstimmen - sonst würde ein zweiter Durchgang derselben Übung samt Sätzen verschwinden.
  const setsDeduped = removeIdenticalChildren(
    next.workoutSets,
    (row) =>
      `${row.workoutLogExerciseId}|${row.setNumber}|${row.reps ?? ''}|${row.weightKg ?? ''}|${row.rpe ?? ''}|${
        row.done ? '1' : '0'
      }`,
  )
  next.workoutSets = setsDeduped.rows
  removed.workoutSets = setsDeduped.removed

  const setsByExercise = new Map<string, string[]>()
  for (const set of [...next.workoutSets].sort((a, b) => a.setNumber - b.setNumber)) {
    const list = setsByExercise.get(set.workoutLogExerciseId) ?? []
    list.push(`${set.setNumber}:${set.reps ?? ''}:${set.weightKg ?? ''}:${set.rpe ?? ''}:${set.done ? 1 : 0}`)
    setsByExercise.set(set.workoutLogExerciseId, list)
  }
  const logExercisesDeduped = removeIdenticalChildren(
    next.workoutLogExercises,
    (row) =>
      `${row.workoutLogId}|${row.exerciseId}|${row.notes ?? ''}|${(setsByExercise.get(row.id) ?? []).join(',')}`,
  )
  next.workoutLogExercises = logExercisesDeduped.rows
  removed.workoutLogExercises = logExercisesDeduped.removed

  // Sätze der weggefallenen Übungszeilen mitnehmen - sie hängen sonst im Nichts.
  if (logExercisesDeduped.removed.length > 0) {
    const orphaned = new Set(logExercisesDeduped.removed)
    const keptSets = next.workoutSets.filter((set) => !orphaned.has(set.workoutLogExerciseId))
    for (const set of next.workoutSets) {
      if (orphaned.has(set.workoutLogExerciseId)) removed.workoutSets.push(set.id)
    }
    next.workoutSets = keptSets
  }

  // 6. Nach dem Umhängen und Löschen die Reihenfolgen wieder lückenlos machen.
  next.planMeals = renumberOrder(next.planMeals, (row) => row.planId, changed.planMeals)
  next.supplementPlanItems = renumberOrder(next.supplementPlanItems, (row) => row.planId, changed.supplementPlanItems)
  next.trainingPlanExercises = renumberOrder(
    next.trainingPlanExercises,
    (row) => row.planId,
    changed.trainingPlanExercises,
  )
  next.nutritionLogItems = renumberOrder(next.nutritionLogItems, (row) => row.nutritionLogId, changed.nutritionLogItems)
  next.workoutLogExercises = renumberOrder(
    next.workoutLogExercises,
    (row) => row.workoutLogId,
    changed.workoutLogExercises,
  )
  next.nutritionPlans = renumberOrder(next.nutritionPlans, (row) => row.athleteId, changed.nutritionPlans)
  next.supplementPlans = renumberOrder(next.supplementPlans, (row) => row.athleteId, changed.supplementPlans)
  next.trainingPlans = renumberOrder(next.trainingPlans, (row) => row.athleteId, changed.trainingPlans)
  next.athletes = renumberOrder(next.athletes, () => 'alle', changed.athletes)

  const updated: DedupeResult['updated'] = {}
  const report: DedupeReport = {}
  for (const table of DEDUPE_TABLES) {
    const changedIds = changed[table]
    if (changedIds.size > 0) {
      const rows = next[table] as unknown as Row[]
      updated[table] = rows.filter((row) => changedIds.has(row.id)) as unknown as Record<string, unknown>[]
    }
    if (removed[table].length > 0) report[table] = removed[table].length
  }

  return {
    updated,
    removed: Object.fromEntries(DEDUPE_TABLES.filter((t) => removed[t].length > 0).map((t) => [t, removed[t]])),
    report,
    mergedAthleteNames,
  }
}

// ------------------------------------------------------------------ Datenbank

async function readSnapshot(): Promise<DedupeSnapshot> {
  const snapshot = {} as DedupeSnapshot
  for (const table of DEDUPE_TABLES) {
    Object.assign(snapshot, { [table]: await db.table(table).toArray() })
  }
  return snapshot
}

/**
 * Sucht Doppelgänger in der Datenbank, ohne etwas zu ändern - für die Rückfrage vor dem
 * Bereinigen ("Was würde passieren?").
 */
export async function findDuplicates(options: DedupeOptions = {}): Promise<DedupeResult> {
  return planDedupe(await readSnapshot(), options)
}

/**
 * Führt Doppelgänger zusammen und liefert zurück, was entfernt wurde. Ohne Funde wird nichts
 * geschrieben - der Aufruf beim App-Start kostet dann nur das Lesen.
 */
export async function dedupeDatabase(options: DedupeOptions = {}): Promise<DedupeReport> {
  const result = planDedupe(await readSnapshot(), options)
  if (dedupeTotal(result.report) === 0) return result.report

  await db.transaction('rw', DEDUPE_TABLES.map((name) => db.table(name)), async () => {
    for (const table of DEDUPE_TABLES) {
      const rows = result.updated[table]
      if (rows && rows.length > 0) await db.table(table).bulkPut(rows)
    }
    // Löschen zum Schluss: Bis dahin hängen alle Verweise schon am überlebenden Datensatz.
    for (const table of DEDUPE_TABLES) {
      const ids = result.removed[table]
      if (ids && ids.length > 0) await db.table(table).bulkDelete(ids)
    }
  })

  return result.report
}

/**
 * Aufräumen beim App-Start. Athleten bleiben dabei unangetastet (siehe `DedupeOptions`), und
 * Fehler werden geschluckt - eine misslungene Bereinigung darf die App nicht am Starten hindern.
 */
export async function ensureNoDuplicates(): Promise<void> {
  try {
    const report = await dedupeDatabase()
    const summary = summarizeDedupe(report)
    if (summary) console.info('Doppelte Einträge zusammengeführt:', summary)
  } catch (err) {
    console.warn('Bereinigung doppelter Einträge fehlgeschlagen:', err)
  }
}
