// Fortschritt-Export/-Import gegen eine echte (In-Memory-)IndexedDB: Profil, Tage und Sätze
// müssen beim Empfänger ankommen - Name und Akzentfarbe des Empfängers bleiben.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { exportProgress, importProgress, todayIso } from './queries'
import type { Athlete } from '../models/types'

// Der Import stößt den Obsidian-Sync an, der seine Einstellungen aus localStorage liest.
if (typeof localStorage === 'undefined') {
  const store = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  } as Storage
}

const athlete = (id: string, patch: Partial<Athlete> = {}): Athlete => ({
  id,
  name: id,
  accentColor: '#ffffff',
  order: 0,
  gender: 'Männlich',
  age: 30,
  heightCm: 180,
  weightKg: 85,
  activityLevel: 'mäßig aktiv',
  goal: 'Diät / Fettabbau',
  proteinPerKg: 2,
  fatPerKg: 1,
  startDate: '2026-01-01',
  ...patch,
})

beforeEach(async () => {
  await db.open()
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('Fortschritt teilen', () => {
  it('überträgt Profil, Tageswerte und Aufwärmsätze', async () => {
    await db.athletes.add(athlete('sender', { name: 'Max', accentColor: '#ff0000', age: 27, weightKg: 91, targetWeightKg: 84, ffmi: 22.5, waterGoalMl: 3500 }))
    await db.athletes.add(athlete('empfaenger', { name: 'Max (Coach)', accentColor: '#00ff00' }))
    const today = todayIso()
    await db.dailyEntries.add({ id: 'd', athleteId: 'sender', date: today, weightKg: 90.4, sleepH: 7.5 })
    await db.exercises.add({ id: 'ex', name: 'Kniebeuge', muscleGroup: 'Beine' })
    await db.workoutLogs.add({ id: 'w', athleteId: 'sender', date: today })
    await db.workoutLogExercises.add({ id: 'we', workoutLogId: 'w', exerciseId: 'ex', order: 0 })
    await db.workoutSets.add({ id: 's', workoutLogExerciseId: 'we', setNumber: 1, reps: 10, weightKg: 60, warmup: true })

    const json = await exportProgress('sender')
    await importProgress(json, 'empfaenger')

    const received = (await db.athletes.get('empfaenger'))!
    expect(received).toMatchObject({ name: 'Max (Coach)', accentColor: '#00ff00', age: 27, weightKg: 91, targetWeightKg: 84, ffmi: 22.5, waterGoalMl: 3500 })
    const entry = await db.dailyEntries.where({ athleteId: 'empfaenger', date: today }).first()
    expect(entry).toMatchObject({ weightKg: 90.4, sleepH: 7.5 })
    const log = await db.workoutLogs.where({ athleteId: 'empfaenger', date: today }).first()
    const row = await db.workoutLogExercises.where('workoutLogId').equals(log!.id).first()
    const sets = await db.workoutSets.where('workoutLogExerciseId').equals(row!.id).toArray()
    expect(sets[0]).toMatchObject({ reps: 10, weightKg: 60, warmup: true })
  })

  it('ältere Dateien ohne Profil lassen das Profil unverändert', async () => {
    await db.athletes.add(athlete('empfaenger', { age: 40 }))
    await importProgress(JSON.stringify({ kind: 'progressExport', version: 1, athleteName: 'x', exportedAt: '', dailyEntries: [], workoutDays: [], nutritionDays: [] }), 'empfaenger')
    expect((await db.athletes.get('empfaenger'))!.age).toBe(40)
  })
})
