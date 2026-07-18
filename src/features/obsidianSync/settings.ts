export interface ObsidianSyncSettings {
  username: string
  repo: string
  token: string
  athleteId: string
}

const STORAGE_KEY = 'obsidian-sync-settings'

export function getSyncSettings(): ObsidianSyncSettings | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ObsidianSyncSettings
    if (!parsed.username || !parsed.repo || !parsed.token || !parsed.athleteId) return null
    return parsed
  } catch {
    return null
  }
}

export function saveSyncSettings(settings: ObsidianSyncSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function clearSyncSettings(): void {
  localStorage.removeItem(STORAGE_KEY)
}
