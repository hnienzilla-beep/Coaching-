import { db } from '../../db/db'
import { triggerAutoSync } from './autoSync'

/**
 * Tabellen, deren Inhalt im Vault landet. Änderungen daran sollen einen Sync auslösen -
 * egal an welcher Stelle der App sie passiert sind. Nicht dabei: `athletes` (nur Auswahl)
 * und `backgroundPhoto` (rein optisch).
 */
const WATCHED_TABLES = [
  'dailyEntries',
  'workoutLogs',
  'workoutLogExercises',
  'workoutSets',
  'nutritionLogs',
  'nutritionLogItems',
  'nutritionPlans',
  'planMeals',
  'supplementPlans',
  'supplementPlanItems',
  'trainingPlans',
  'trainingPlanExercises',
  'foodItems',
  'supplements',
  'exercises',
]

let attached = false

/**
 * Hängt sich an die Schreib-Hooks der relevanten Dexie-Tabellen, damit jede Datenänderung
 * den Auto-Sync anstößt - ohne dass jede Seite das selbst aufrufen muss.
 */
export function watchDatabaseChanges(): void {
  if (attached) return
  attached = true

  for (const name of WATCHED_TABLES) {
    const table = db.tables.find((t) => t.name === name)
    if (!table) continue // Tabelle existiert erst ab einer späteren DB-Version
    table.hook('creating', () => {
      triggerAutoSync()
    })
    table.hook('updating', () => {
      triggerAutoSync()
    })
    table.hook('deleting', () => {
      triggerAutoSync()
    })
  }
}
