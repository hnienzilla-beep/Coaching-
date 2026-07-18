import { getSyncSettings } from './settings'
import { syncFitnessHeute } from './fitnessExport'

let debounceTimer: ReturnType<typeof setTimeout> | null = null

/** Löst nach kurzer Verzögerung (Debounce) einen automatischen Sync aus, falls eingerichtet. */
export function triggerAutoSync(): void {
  if (!getSyncSettings()) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    syncFitnessHeute().catch((err) => {
      console.warn('Obsidian-Sync (automatisch) fehlgeschlagen:', err)
    })
  }, 3000)
}
