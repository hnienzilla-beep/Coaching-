import { getSyncSettings } from './settings'
import type { ObsidianSyncSettings } from './settings'

/**
 * Protokoll eines Sync-Laufs: Was wurde aus dem Vault übernommen, was übersprungen. Die
 * Importer aller Datenarten melden sich hier, die Oberfläche zeigt die Kurzfassung an.
 */

export interface ImportResult {
  /** Was importiert wurde, z.B. "Gewicht" oder "Training 2026-07-28". */
  label: string
  /** Anzahl übernommener Einträge. */
  changed: number
  /** Übersprungenes: unbekannte Lebensmittel bzw. fehlerhafte Zeilen. */
  skipped: string[]
}

let collected: ImportResult[] = []

export function resetImportLog(): void {
  collected = []
}

export function getImportLog(): ImportResult[] {
  return collected
}

/** Kurzfassung für die Statusanzeige, z.B. "Gewicht (12), Training 2026-07-28 (4)". */
export function summarizeImports(results: ImportResult[]): string | null {
  const relevant = results.filter((r) => r.changed > 0 || r.skipped.length > 0)
  if (relevant.length === 0) return null
  return relevant
    .map((r) => {
      const skipped = r.skipped.length > 0 ? `, ${r.skipped.length} übersprungen` : ''
      return `${r.label} (${r.changed}${skipped})`
    })
    .join(', ')
}

export function record(result: ImportResult): ImportResult {
  collected.push(result)
  return result
}

export function requireSettings(): ObsidianSyncSettings {
  const settings = getSyncSettings()
  if (!settings) throw new Error('Obsidian-Sync ist noch nicht eingerichtet.')
  return settings
}

/** Nachschlagewerk über den Namen - so werden Referenzen geräteübergreifend aufgelöst. */
export function byName<T extends { name: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.name.trim().toLowerCase(), item]))
}

/** Schlüssel für `byName`-Karten. */
export function nameKey(name: string): string {
  return name.trim().toLowerCase()
}
