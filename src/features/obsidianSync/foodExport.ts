import { db } from '../../db/db'
import { isoDate } from '../../db/queries'
import { getSyncSettings } from './settings'
import { syncFile } from './githubApi'
import { importLebensmittelNeu } from './vaultImport'

export const LEBENSMITTEL_PATH = '40-Ernaehrung/Lebensmittel.md'

/** Pipe-Zeichen im Namen würden die Markdowntabelle sprengen. */
function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|')
}

/**
 * Baut Lebensmittel.md: die komplette Lebensmitteldatenbank als Markdowntabelle, Nährwerte
 * je 100 g.
 *
 * Der Name steht zeichengleich so in der Tabelle, wie ihn die App auch in die Tageslogs
 * schreibt ("- [ ] Reis (roh) – 100g (349 kcal)") - daran hängt die Zuordnung beim Rücklesen.
 * Sortiert wird nach Namen, damit Git-Diffs lesbar bleiben.
 */
async function buildLebensmittel(): Promise<string> {
  const foods = await db.foodItems.toArray()
  const sorted = [...foods].sort((a, b) => a.name.localeCompare(b.name, 'de'))

  return [
    '---',
    'typ: lebensmittel',
    'quelle: fitness-app',
    `stand: ${isoDate(new Date())}`,
    '---',
    '',
    '# Lebensmittel-Datenbank',
    '',
    '| Name | kcal | Protein | KH | Fett |',
    '|---|---|---|---|---|',
    ...sorted.map(
      (f) =>
        `| ${escapeCell(f.name)} | ${Math.round(f.kcal)} | ${f.protein.toFixed(1)} | ${f.carbs.toFixed(1)} | ${f.fat.toFixed(1)} |`,
    ),
    '',
  ].join('\n')
}

/**
 * Gleicht die Lebensmitteldatenbank mit dem Vault ab.
 *
 * Erst der Import aus Lebensmittel-Neu.md, dann der Export - so tauchen neu angelegte
 * Lebensmittel schon im selben Sync-Durchlauf in Lebensmittel.md auf.
 */
export async function syncLebensmittel(): Promise<void> {
  const settings = getSyncSettings()
  if (settings?.importFromVault) {
    await importLebensmittelNeu()
  }

  await syncFile({
    path: LEBENSMITTEL_PATH,
    build: buildLebensmittel,
    commitMessage: `Sync ${isoDate(new Date())}: Lebensmittel-Datenbank`,
    // Reiner Datenbankabzug: die Datei wird bei jedem Sync komplett überschrieben, es gibt
    // also auch keinen Notizen-Block, der erhalten bleiben müsste.
    preserveNotes: false,
  })
}
