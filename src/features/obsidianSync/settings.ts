export interface ObsidianSyncSettings {
  username: string
  repo: string
  token: string
  athleteId: string
  /** Automatisch im Hintergrund synchronisieren (Standard: an). */
  autoSync: boolean
  /** Abstand zwischen zwei automatischen Syncs in Minuten. */
  intervalMinutes: number
}

const STORAGE_KEY = 'obsidian-sync-settings'

export const DEFAULT_INTERVAL_MINUTES = 15
export const MIN_INTERVAL_MINUTES = 5
export const MAX_INTERVAL_MINUTES = 24 * 60

/** Auswahlmöglichkeiten für das Sync-Intervall in den Einstellungen. */
export const INTERVAL_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 5, label: 'alle 5 Minuten' },
  { minutes: 15, label: 'alle 15 Minuten' },
  { minutes: 30, label: 'alle 30 Minuten' },
  { minutes: 60, label: 'jede Stunde' },
  { minutes: 360, label: 'alle 6 Stunden' },
  { minutes: 1440, label: 'einmal täglich' },
]

function normalizeInterval(value: unknown): number {
  const minutes = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : DEFAULT_INTERVAL_MINUTES
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, minutes))
}

export function getSyncSettings(): ObsidianSyncSettings | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ObsidianSyncSettings>
    if (!parsed.username || !parsed.repo || !parsed.token || !parsed.athleteId) return null
    return {
      username: parsed.username,
      repo: parsed.repo,
      token: parsed.token,
      athleteId: parsed.athleteId,
      // Bestandsnutzer haben diese Felder noch nicht gespeichert - dort ist Auto-Sync an.
      autoSync: parsed.autoSync ?? true,
      intervalMinutes: normalizeInterval(parsed.intervalMinutes),
    }
  } catch {
    return null
  }
}

export function saveSyncSettings(settings: ObsidianSyncSettings): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...settings, intervalMinutes: normalizeInterval(settings.intervalMinutes) }),
  )
}

export function clearSyncSettings(): void {
  localStorage.removeItem(STORAGE_KEY)
}
