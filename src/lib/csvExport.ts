import { db } from '../db/db'

/*
 * CSV-Export (Semikolon, deutsches Dezimalkomma - öffnet so direkt richtig in Excel/Numbers).
 * Werte bleiben metrisch, damit die Tabellen unabhängig von der Anzeige-Einheit vergleichbar sind.
 */

function cell(v: unknown): string {
  if (v === undefined || v === null) return ''
  const s = typeof v === 'number' ? v.toLocaleString('de-DE', { useGrouping: false, maximumFractionDigits: 2 }) : String(v)
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(header: string[], rows: unknown[][]): string {
  // BOM, damit Excel Umlaute richtig liest.
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\n')
}

export async function dailyCsv(athleteId: string): Promise<string> {
  const entries = (await db.dailyEntries.where('athleteId').equals(athleteId).toArray()).sort((a, b) => a.date.localeCompare(b.date))
  const header = ['Datum', 'Gewicht kg', 'KFA %', 'kcal', 'Protein g', 'Carbs g', 'Fett g', 'Wasser ml', 'Bauch cm', 'Arm cm', 'Brust cm', 'Bein cm', 'Hüfte cm', 'Po cm', 'Wade cm', 'Nacken cm', 'Schlaf h', 'Schritte', 'Notiz']
  const rows = entries.map((e) => [e.date, e.weightKg, e.bodyFatPct, e.calories, e.protein, e.carbs, e.fat, e.waterMl, e.waist, e.arm, e.chest, e.leg, e.hip, e.glute, e.calf, e.neck, e.sleepH, e.steps, e.notes])
  return toCsv(header, rows)
}

export async function nutritionCsv(athleteId: string): Promise<string> {
  const logs = await db.nutritionLogs.where('athleteId').equals(athleteId).toArray()
  const dateOf = new Map(logs.map((l) => [l.id, l.date]))
  const items = await db.nutritionLogItems.where('nutritionLogId').anyOf([...dateOf.keys()]).toArray()
  const foods = new Map((await db.foodItems.toArray()).map((f) => [f.id, f]))
  const header = ['Datum', 'Mahlzeit', 'Lebensmittel', 'Gramm', 'kcal', 'Protein g', 'Carbs g', 'Fett g']
  const rows = items
    .map((i) => {
      const f = foods.get(i.foodItemId)
      const k = i.grams / 100
      const p = (f?.protein ?? 0) * k
      const c = (f?.carbs ?? 0) * k
      const fat = (f?.fat ?? 0) * k
      return [dateOf.get(i.nutritionLogId) ?? '', i.mealType, f?.name ?? '?', i.grams, Math.round((f?.kcal ?? 0) * k), Math.round(p), Math.round(c), Math.round(fat)]
    })
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  return toCsv(header, rows)
}

export async function trainingCsv(athleteId: string): Promise<string> {
  const logs = await db.workoutLogs.where('athleteId').equals(athleteId).toArray()
  const plans = new Map((await db.trainingPlans.where('athleteId').equals(athleteId).toArray()).map((p) => [p.id, p.phaseName]))
  const logById = new Map(logs.map((l) => [l.id, l]))
  const rows_ = await db.workoutLogExercises.where('workoutLogId').anyOf([...logById.keys()]).toArray()
  const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e.name]))
  const sets = await db.workoutSets.where('workoutLogExerciseId').anyOf(rows_.map((r) => r.id)).toArray()
  const rowById = new Map(rows_.map((r) => [r.id, r]))
  const header = ['Datum', 'Trainingstag', 'Übung', 'Satz', 'Wdh.', 'Gewicht kg', 'RPE', 'Aufwärmsatz', 'Erledigt']
  const rows = sets
    .map((s) => {
      const r = rowById.get(s.workoutLogExerciseId)
      const log = r ? logById.get(r.workoutLogId) : undefined
      return [log?.date ?? '', log?.trainingPlanId ? plans.get(log.trainingPlanId) : '', r ? exercises.get(r.exerciseId) : '', s.setNumber, s.reps, s.weightKg, s.rpe, s.warmup ? 'ja' : '', s.done ? 'ja' : '']
    })
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[2]).localeCompare(String(b[2])) || Number(a[3]) - Number(b[3]))
  return toCsv(header, rows)
}
