import { exportAthletes, importAllData } from '../../db/db'
import { dedupeDatabase } from '../../db/dedupe'
import { requireSettings } from './importLog'
import { readFile, syncFile } from './githubApi'
import type { VaultTree } from './githubApi'
import { withVaultImport } from './syncState'

/**
 * Verlustfreies JSON-Vollbackup im Vault.
 *
 * Die Markdown-Dateien sind zum Lesen und Bearbeiten in Obsidian gedacht und bilden deshalb
 * nicht jedes Feld ab (interne IDs, Reihenfolgen, Häkchen-Details). Diese Datei schließt die
 * Lücke: Sie enthält den kompletten Datenbestand des gewählten Athleten samt der globalen
 * Referenztabellen (Lebensmittel, Supplemente, Übungen) und lässt sich auf einem neuen Gerät
 * in einem Schritt zurückladen.
 *
 * Gelesen wird sie nur auf ausdrücklichen Wunsch ("Backup aus Vault wiederherstellen") - im
 * laufenden Sync würde sie sonst mit den Markdown-Dateien um denselben Datenbestand streiten.
 */

export const BACKUP_PATH = '90-Backup/fitness-app-backup.json'

/** Felder, die im Backup nichts verloren haben - Bilder blähen die Datei stark auf. */
const DROPPED_FIELDS = ['imageDataUrl']

function sortedKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(row).sort()) {
    if (DROPPED_FIELDS.includes(key)) continue
    out[key] = row[key]
  }
  return out
}

/**
 * Baut das Backup **deterministisch**: keine Zeitstempel, Tabellen und Zeilen stabil sortiert,
 * Schlüssel je Zeile alphabetisch. Sonst würde sich der Inhalt bei jedem Sync unterscheiden und
 * für jeden Durchlauf ein neuer Commit entstehen.
 */
async function buildBackup(): Promise<string> {
  const settings = requireSettings()
  const parsed = JSON.parse(await exportAthletes([settings.athleteId])) as {
    data: Record<string, Record<string, unknown>[]>
  }

  const data: Record<string, Record<string, unknown>[]> = {}
  for (const table of Object.keys(parsed.data).sort()) {
    data[table] = parsed.data[table]
      .map(sortedKeys)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  }

  return `${JSON.stringify({ version: 1, data }, null, 2)}\n`
}

/** Schreibt das Backup in den Vault (nur schreibend - siehe `restoreFromVaultBackup`). */
export async function syncBackup(tree?: VaultTree | null): Promise<void> {
  await syncFile({
    path: BACKUP_PATH,
    build: buildBackup,
    commitMessage: 'Sync: Vollbackup',
    // Reiner Datenbank-Abzug in JSON: kein Notizen-Block, der erhalten bleiben müsste.
    preserveNotes: false,
    tree,
  })
}

/**
 * Lädt das Vollbackup aus dem Vault zurück in die App. Bestehende Datensätze mit derselben ID
 * werden überschrieben, alles andere bleibt erhalten. `false`, wenn es im Vault kein Backup gibt.
 *
 * Anschließend wird bereinigt: Auf einem Gerät, das seine Lebensmittel-, Übungs- und
 * Supplement-Datenbank schon selbst angelegt hat, treffen zwei Datenbestände mit verschiedenen
 * IDs aufeinander - ohne diesen Schritt stünde danach alles doppelt in der App.
 */
export async function restoreFromVaultBackup(): Promise<boolean> {
  requireSettings()
  const remote = await readFile(BACKUP_PATH)
  if (!remote || !remote.content.trim()) return false

  await withVaultImport(async () => {
    await importAllData(remote.content)
    await dedupeDatabase()
  })
  return true
}
