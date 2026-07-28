import { getSyncSettings } from './settings'
import { syncFitnessHeute } from './fitnessExport'
import { getSyncState, isImportingFromVault, setSyncState } from './syncState'
import { getImportLog, resetImportLog, summarizeImports } from './vaultImport'

/**
 * Automatischer Vault-Sync.
 *
 * Die App läuft komplett im Browser (Daten in IndexedDB), es gibt keinen Server, der im
 * Hintergrund synchronisieren könnte. Der Sync läuft deshalb, solange die App geöffnet ist:
 *
 * - kurz nach dem Start (falls das Intervall abgelaufen ist oder Änderungen offen sind)
 * - danach regelmäßig im eingestellten Intervall
 * - kurz nach jeder Datenänderung (entprellt)
 * - wenn die App wieder in den Vordergrund kommt oder das Gerät wieder online ist
 *
 * Fehlgeschlagene Versuche werden mit wachsendem Abstand wiederholt; offene Änderungen
 * bleiben in localStorage vermerkt, sodass sie auch nach einem App-Neustart nachgeholt werden.
 */

/** Wartezeit nach der letzten Datenänderung, bevor gesynct wird. */
const CHANGE_DEBOUNCE_MS = 10_000
/** Mindestabstand zwischen zwei Syncs, damit schnelle Eingaben nicht dauernd hochladen. */
const MIN_GAP_MS = 60_000
/** Takt, in dem geprüft wird, ob ein Sync fällig ist. */
const TICK_MS = 60_000
/** Wartezeiten nach dem 1., 2., 3., ... Fehlversuch. */
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000]
/** Verzögerung des ersten Syncs nach dem App-Start (die App soll erst fertig laden). */
const STARTUP_DELAY_MS = 5_000

let running = false
let rerunRequested = false
let failureCount = 0
let nextAttemptAt = 0
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let tickTimer: ReturnType<typeof setInterval> | null = null
let startupTimer: ReturnType<typeof setTimeout> | null = null
let listenersAttached = false

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unbekannter Fehler beim Sync.'
}

function dayOf(timestamp: number): string {
  return new Date(timestamp).toDateString()
}

/**
 * Führt den Sync aus. Änderungen, die währenddessen eintreffen, lösen direkt im Anschluss
 * einen weiteren Durchlauf aus - erst danach gilt "alles hochgeladen".
 */
async function performSync(): Promise<void> {
  if (running) {
    rerunRequested = true
    return
  }
  running = true
  setSyncState({ running: true })
  try {
    resetImportLog()
    do {
      rerunRequested = false
      await syncFitnessHeute()
    } while (rerunRequested)
    failureCount = 0
    nextAttemptAt = 0
    setSyncState({
      running: false,
      lastSyncAt: new Date().toISOString(),
      lastError: null,
      pendingChanges: false,
      lastImport: summarizeImports(getImportLog()),
    })
  } catch (err) {
    failureCount++
    nextAttemptAt = Date.now() + BACKOFF_MS[Math.min(failureCount - 1, BACKOFF_MS.length - 1)]
    setSyncState({ running: false, lastError: errorMessage(err) })
    throw err
  } finally {
    running = false
  }
}

/** Sync auf Knopfdruck: ignoriert Intervall und Backoff und meldet Fehler an den Aufrufer. */
export async function syncNow(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  failureCount = 0
  nextAttemptAt = 0
  await performSync()
}

/** Automatischer Sync: schluckt Fehler (sie landen im Sync-Status). */
function runAutoSync(): void {
  performSync().catch((err) => {
    console.warn('Obsidian-Sync (automatisch) fehlgeschlagen:', err)
  })
}

/** Prüft, ob ein automatischer Sync fällig ist, und startet ihn gegebenenfalls. */
function tick(): void {
  const settings = getSyncSettings()
  if (!settings || !settings.autoSync) return
  if (running) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return

  const now = Date.now()
  if (nextAttemptAt && now < nextAttemptAt) return // Backoff nach Fehlversuch

  const state = getSyncState()
  const last = state.lastSyncAt ? Date.parse(state.lastSyncAt) : 0
  if (last && now - last < MIN_GAP_MS) return

  const dueByInterval = now - last >= settings.intervalMinutes * 60_000
  // Nach Mitternacht entstehen neue Tagesdateien (Training/Ernährung) - dann lohnt ein Sync
  // auch dann, wenn das Intervall noch nicht abgelaufen ist.
  const dueByNewDay = last > 0 && dayOf(last) !== dayOf(now)
  if (!dueByInterval && !dueByNewDay && !state.pendingChanges) return

  runAutoSync()
}

/**
 * Meldet geänderte Daten. Der eigentliche Sync passiert entprellt kurz danach, damit
 * schnell aufeinanderfolgende Eingaben zu einem Upload zusammengefasst werden.
 */
export function triggerAutoSync(): void {
  // Schreibvorgänge eines laufenden Vault-Imports sind keine Nutzeränderungen - sonst
  // würde jeder Import direkt den nächsten Sync anstoßen.
  if (isImportingFromVault()) return
  const settings = getSyncSettings()
  if (!settings) return
  setSyncState({ pendingChanges: true })
  if (!settings.autoSync) return

  if (running) {
    rerunRequested = true
    return
  }
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    // Ein Fehlversuch bremst auch die änderungsgetriebenen Syncs aus - sonst würde z.B. ein
    // ungültiger Token bei jeder Eingabe eine neue GitHub-Anfrage auslösen.
    if (nextAttemptAt && Date.now() < nextAttemptAt) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    runAutoSync()
  }, CHANGE_DEBOUNCE_MS)
}

/** Nach Änderungen an den Sync-Einstellungen erneut prüfen (Intervall/Auto-Sync geändert). */
export function notifySyncSettingsChanged(): void {
  failureCount = 0
  nextAttemptAt = 0
  tick()
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    tick()
    return
  }
  // App geht in den Hintergrund: offene Änderungen möglichst noch loswerden, bevor iOS die
  // PWA einfriert. Klappt das nicht, bleibt pendingChanges gesetzt und der nächste Start
  // holt den Sync nach.
  const settings = getSyncSettings()
  if (settings?.autoSync && getSyncState().pendingChanges && !running) {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    runAutoSync()
  }
}

/** Startet den Auto-Sync-Scheduler (idempotent - mehrfacher Aufruf ist unschädlich). */
export function startAutoSync(): void {
  if (listenersAttached) return
  listenersAttached = true

  startupTimer = setTimeout(() => {
    startupTimer = null
    tick()
  }, STARTUP_DELAY_MS)

  tickTimer = setInterval(tick, TICK_MS)

  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('focus', tick)
  window.addEventListener('online', tick)
  window.addEventListener('pagehide', handleVisibilityChange)
}

/** Gegenstück zu startAutoSync (für HMR/Tests). */
export function stopAutoSync(): void {
  if (!listenersAttached) return
  listenersAttached = false
  if (startupTimer) clearTimeout(startupTimer)
  if (tickTimer) clearInterval(tickTimer)
  if (debounceTimer) clearTimeout(debounceTimer)
  startupTimer = null
  tickTimer = null
  debounceTimer = null
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('focus', tick)
  window.removeEventListener('online', tick)
  window.removeEventListener('pagehide', handleVisibilityChange)
}
