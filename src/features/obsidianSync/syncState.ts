/**
 * Zustand des Auto-Syncs (läuft gerade / zuletzt erfolgreich / offene Änderungen).
 *
 * `lastSyncAt`, `lastError` und `pendingChanges` werden in localStorage gespiegelt, damit
 * ein Neustart der App weiß, ob noch ungesyncte Änderungen offen sind (z.B. wenn iOS die
 * PWA mitten im Sync beendet hat).
 */

export interface SyncState {
  /** Ein Sync läuft gerade. */
  running: boolean
  /** Zeitpunkt des letzten erfolgreichen Syncs (ISO) oder null. */
  lastSyncAt: string | null
  /** Fehlermeldung des letzten Versuchs oder null, wenn er erfolgreich war. */
  lastError: string | null
  /** Es gab Datenänderungen, die noch nicht hochgeladen wurden. */
  pendingChanges: boolean
}

const STORAGE_KEY = 'obsidian-sync-state'

interface PersistedState {
  lastSyncAt: string | null
  lastError: string | null
  pendingChanges: boolean
}

function loadPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { lastSyncAt: null, lastError: null, pendingChanges: false }
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return {
      lastSyncAt: typeof parsed.lastSyncAt === 'string' ? parsed.lastSyncAt : null,
      lastError: typeof parsed.lastError === 'string' ? parsed.lastError : null,
      pendingChanges: parsed.pendingChanges === true,
    }
  } catch {
    return { lastSyncAt: null, lastError: null, pendingChanges: false }
  }
}

let state: SyncState = { running: false, ...loadPersisted() }

const listeners = new Set<() => void>()

export function getSyncState(): SyncState {
  return state
}

/** Abo für React (useSyncExternalStore) und andere Interessenten. */
export function subscribeSyncState(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setSyncState(patch: Partial<SyncState>): void {
  const next = { ...state, ...patch }
  if (
    next.running === state.running &&
    next.lastSyncAt === state.lastSyncAt &&
    next.lastError === state.lastError &&
    next.pendingChanges === state.pendingChanges
  ) {
    return
  }
  state = next
  try {
    const persisted: PersistedState = {
      lastSyncAt: state.lastSyncAt,
      lastError: state.lastError,
      pendingChanges: state.pendingChanges,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
  } catch {
    // Speicher voll oder Private Mode - der In-Memory-Zustand reicht für diese Sitzung.
  }
  listeners.forEach((l) => l())
}
