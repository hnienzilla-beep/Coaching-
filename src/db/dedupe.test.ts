// Diese Migration löscht Zeilen - deshalb hier gegen eine echte (In-Memory-)IndexedDB statt
// gegen nachgebaute Logik. Geprüft wird beides: dass die Dublette verschwindet und dass kein
// Verweis aus Plänen oder Logs dabei ins Leere zeigt.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { dedupeNamedDatabases } from './dedupe'
import type { Exercise, FoodItem, Supplement } from '../models/types'

const food = (id: string, name: string, extra: Partial<FoodItem> = {}): FoodItem => ({
  id,
  name,
  kcal: 100,
  protein: 10,
  carbs: 5,
  fat: 2,
  ...extra,
})

beforeEach(async () => {
  await db.open()
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('dedupeNamedDatabases – Lebensmittel', () => {
  it('führt namensgleiche Einträge zusammen und hängt Log-Einträge um', async () => {
    await db.foodItems.bulkAdd([food('a', 'Apfel'), food('b', 'Apfel')])
    await db.nutritionLogs.add({ id: 'log', athleteId: 'ath', date: '2026-08-18' })
    await db.nutritionLogItems.bulkAdd([
      { id: 'i1', nutritionLogId: 'log', mealType: 'Frühstück', foodItemId: 'a', grams: 100, order: 0 },
      { id: 'i2', nutritionLogId: 'log', mealType: 'Frühstück', foodItemId: 'b', grams: 50, order: 1 },
    ])

    const summary = await dedupeNamedDatabases()

    expect(summary.foodItems).toBe(1)
    const remaining = await db.foodItems.toArray()
    expect(remaining).toHaveLength(1)
    // Kein Eintrag darf auf ein gelöschtes Lebensmittel zeigen - das wäre im Log ein "?".
    const items = await db.nutritionLogItems.toArray()
    expect(items.every((i) => i.foodItemId === remaining[0].id)).toBe(true)
  })

  it('behandelt Groß-/Kleinschreibung und Leerzeichen als denselben Namen', async () => {
    await db.foodItems.bulkAdd([food('a', 'Skyr'), food('b', ' skyr ')])

    expect((await dedupeNamedDatabases()).foodItems).toBe(1)
    expect(await db.foodItems.count()).toBe(1)
  })

  it('behält die bestätigten Nährwerte, nicht die Schätzung', async () => {
    await db.foodItems.bulkAdd([
      food('geschaetzt', 'Isoclear', { kcal: 373, protein: 88, unconfirmed: true }),
      food('gemessen', 'Isoclear', { kcal: 349, protein: 81 }),
    ])

    await dedupeNamedDatabases()

    const [left] = await db.foodItems.toArray()
    expect(left.id).toBe('gemessen')
    expect(left.protein).toBe(81)
  })

  it('rettet den Favoriten-Stern der verworfenen Dublette', async () => {
    await db.foodItems.bulkAdd([food('a', 'Reis (roh)'), food('b', 'Reis (roh)', { favorite: true })])

    await dedupeNamedDatabases()

    const [left] = await db.foodItems.toArray()
    expect(left.favorite).toBe(true)
  })

  it('bevorzugt den bestätigten Eintrag auch gegen die häufiger benutzte Schätzung', async () => {
    // Datenqualität schlägt Nutzungshäufigkeit: 'a' hat den Verweis, 'b' die gemessenen Werte.
    await db.foodItems.bulkAdd([food('a', 'Mandelmus', { unconfirmed: true }), food('b', 'Mandelmus')])
    await db.nutritionLogs.add({ id: 'log', athleteId: 'ath', date: '2026-08-18' })
    await db.nutritionLogItems.add({ id: 'i1', nutritionLogId: 'log', mealType: 'Snack 1', foodItemId: 'a', grams: 10, order: 0 })

    await dedupeNamedDatabases()

    const [left] = await db.foodItems.toArray()
    expect(left.id).toBe('b')
    expect(left.unconfirmed).toBeFalsy()
    expect((await db.nutritionLogItems.get('i1'))?.foodItemId).toBe('b')
  })

  it('entscheidet bei Gleichstand über die Verweise, dann über die ID', async () => {
    // Deterministisch, damit zwei Geräte unabhängig voneinander dasselbe Ergebnis bekommen -
    // und damit der doppelte Effekt-Aufruf im React-StrictMode nicht gegeneinander arbeitet.
    await db.foodItems.bulkAdd([food('zzz', 'Birne'), food('aaa', 'Birne')])
    await db.nutritionLogs.add({ id: 'log', athleteId: 'ath', date: '2026-08-18' })
    await db.nutritionLogItems.add({ id: 'i1', nutritionLogId: 'log', mealType: 'Snack 1', foodItemId: 'zzz', grams: 10, order: 0 })

    await dedupeNamedDatabases()

    expect((await db.foodItems.toArray())[0].id).toBe('zzz')
  })

  it('lässt einen sauberen Datenbestand unangetastet', async () => {
    await db.foodItems.bulkAdd([food('a', 'Apfel'), food('b', 'Birne')])

    expect(await dedupeNamedDatabases()).toEqual({ foodItems: 0, exercises: 0, supplements: 0 })
    expect(await db.foodItems.count()).toBe(2)
  })

  it('räumt auch Dreifach-Dubletten in einem Lauf ab', async () => {
    await db.foodItems.bulkAdd([food('a', 'Tomate'), food('b', 'Tomate'), food('c', 'Tomate')])

    expect((await dedupeNamedDatabases()).foodItems).toBe(2)
    expect(await db.foodItems.count()).toBe(1)
  })
})

describe('dedupeNamedDatabases – Übungen', () => {
  const exercise = (id: string, name: string, extra: Partial<Exercise> = {}): Exercise => ({
    id,
    name,
    muscleGroup: 'Sonstiges',
    ...extra,
  })

  it('behält die gepflegte Übung und hängt Plan und Log um', async () => {
    await db.exercises.bulkAdd([
      exercise('auto', 'Kniebeuge'),
      exercise('gepflegt', 'Kniebeuge', { muscleGroup: 'Beine', imageDataUrl: 'data:image/png;base64,xx' }),
    ])
    await db.trainingPlanExercises.add({ id: 'p1', planId: 'plan', exerciseId: 'auto', sets: 3, reps: '8', order: 0 })
    await db.workoutLogs.add({ id: 'wl', athleteId: 'ath', date: '2026-08-18' })
    await db.workoutLogExercises.add({ id: 'w1', workoutLogId: 'wl', exerciseId: 'auto', order: 0 })

    expect((await dedupeNamedDatabases()).exercises).toBe(1)

    const [left] = await db.exercises.toArray()
    expect(left.id).toBe('gepflegt')
    expect((await db.trainingPlanExercises.get('p1'))?.exerciseId).toBe('gepflegt')
    expect((await db.workoutLogExercises.get('w1'))?.exerciseId).toBe('gepflegt')
  })

  it('rettet die gepflegte Muskelgruppe, wenn das Bild an der anderen Dublette hängt', async () => {
    // Bild und Muskelgruppe können an verschiedenen Zeilen hängen - die Zeile mit Bild bleibt,
    // die Muskelgruppe der anderen muss trotzdem mitkommen.
    await db.exercises.bulkAdd([
      exercise('mitBild', 'Seitheben', { imageDataUrl: 'data:image/png;base64,zz' }),
      exercise('mitGruppe', 'Seitheben', { muscleGroup: 'Schultern' }),
    ])

    await dedupeNamedDatabases()

    const [left] = await db.exercises.toArray()
    expect(left.id).toBe('mitBild')
    expect(left.muscleGroup).toBe('Schultern')
    expect(left.imageDataUrl).toBe('data:image/png;base64,zz')
  })

  it('rettet das Übungsbild der verworfenen Dublette', async () => {
    await db.exercises.bulkAdd([
      exercise('a', 'Klimmzüge', { muscleGroup: 'Rücken' }),
      exercise('b', 'Klimmzüge', { imageDataUrl: 'data:image/png;base64,yy' }),
    ])

    await dedupeNamedDatabases()

    const [left] = await db.exercises.toArray()
    expect(left.imageDataUrl).toBe('data:image/png;base64,yy')
  })
})

describe('dedupeNamedDatabases – Supplemente', () => {
  const supplement = (id: string, name: string, extra: Partial<Supplement> = {}): Supplement => ({
    id,
    name,
    defaultDose: '',
    defaultTiming: 'Morgens',
    ...extra,
  })

  it('führt Dosis und Notiz aus verschiedenen Dubletten zusammen', async () => {
    await db.supplements.bulkAdd([
      supplement('a', 'Magnesium', { defaultDose: '400 mg' }),
      supplement('b', 'Magnesium', { notes: 'abends zum Essen' }),
    ])

    await dedupeNamedDatabases()

    const [left] = await db.supplements.toArray()
    expect(left.defaultDose).toBe('400 mg')
    expect(left.notes).toBe('abends zum Essen')
  })

  it('behält den Eintrag mit Dosis und hängt den Plan um', async () => {
    await db.supplements.bulkAdd([supplement('leer', 'Zink'), supplement('dosis', 'Zink', { defaultDose: '25 mg' })])
    await db.supplementPlanItems.add({
      id: 's1',
      planId: 'plan',
      supplementId: 'leer',
      dose: '25 mg',
      timing: 'Morgens',
      order: 0,
    })

    expect((await dedupeNamedDatabases()).supplements).toBe(1)

    const [left] = await db.supplements.toArray()
    expect(left.id).toBe('dosis')
    expect((await db.supplementPlanItems.get('s1'))?.supplementId).toBe('dosis')
  })
})
