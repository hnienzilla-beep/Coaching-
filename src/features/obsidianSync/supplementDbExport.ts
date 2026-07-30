import { db } from '../../db/db'
import type { Supplement } from '../../models/types'
import { byName, nameKey, record, requireSettings } from './importLog'
import type { ImportResult } from './importLog'
import { buildFrontmatter, tableRow, tableSeparator } from './markdownBuild'
import { parseSupplementDatenbank } from './markdownParse'
import { syncFile } from './githubApi'
import type { VaultTree } from './githubApi'
import { withVaultImport } from './syncState'

/**
 * Supplement-Datenbank als Tabelle in `20-Fitness/Supplement-Datenbank.md` - die Stammdaten
 * (Standarddosis und -timing), unabhängig davon, was in einem Supplementplan steht.
 */

export const SUPPLEMENT_DB_PATH = '20-Fitness/Supplement-Datenbank.md'

const HEADER = ['Supplement', 'Standarddosis', 'Timing', 'Notiz']

async function buildSupplementDatenbank(): Promise<string> {
  const supplements = await db.supplements.toArray()
  const sorted = [...supplements].sort((a, b) => a.name.localeCompare(b.name, 'de'))

  return [
    ...buildFrontmatter({ typ: 'supplement-datenbank', quelle: 'fitness-app' }),
    '# Supplement-Datenbank',
    '',
    'Neue Zeilen werden beim nächsten Sync angelegt, geänderte Werte übernommen. Hier gelöschte',
    'Zeilen löschen kein Supplement - sie hängen an den Supplementplänen.',
    '',
    tableRow(HEADER),
    tableSeparator(HEADER.length),
    ...sorted.map((s) => tableRow([s.name, s.defaultDose, s.defaultTiming, s.notes])),
    '',
  ].join('\n')
}

/**
 * Übernimmt die Supplement-Stammdaten aus dem Vault: bekannte Namen aktualisieren, unbekannte
 * anlegen, nichts löschen. Ein unbekanntes Timing wird ignoriert.
 */
export async function importSupplementDatenbank(content: string): Promise<ImportResult> {
  const rows = parseSupplementDatenbank(content)
  if (rows.length === 0) return record({ label: 'Supplement-Datenbank', changed: 0, skipped: [] })

  let changed = 0
  await withVaultImport(async () => {
    await db.transaction('rw', db.supplements, async () => {
      const existing = byName(await db.supplements.toArray())
      for (const row of rows) {
        const supplement = existing.get(nameKey(row.name))
        if (!supplement) {
          const created: Supplement = {
            id: crypto.randomUUID(),
            name: row.name,
            defaultDose: row.defaultDose ?? '',
            defaultTiming: row.defaultTiming ?? 'Morgens',
            notes: row.notes,
          }
          await db.supplements.add(created)
          existing.set(nameKey(row.name), created)
          changed++
          continue
        }

        const patch: Partial<Supplement> = {}
        if (row.defaultDose !== undefined && row.defaultDose !== supplement.defaultDose) {
          patch.defaultDose = row.defaultDose
        }
        if (row.defaultTiming && row.defaultTiming !== supplement.defaultTiming) {
          patch.defaultTiming = row.defaultTiming
        }
        if (row.notes !== supplement.notes) patch.notes = row.notes
        if (Object.keys(patch).length === 0) continue
        await db.supplements.update(supplement.id, patch)
        changed++
      }
    })
  })

  return record({ label: 'Supplement-Datenbank', changed, skipped: [] })
}

/** Gleicht die Supplement-Datenbank in beide Richtungen ab. */
export async function syncSupplementDatenbank(tree?: VaultTree | null): Promise<void> {
  requireSettings()
  await syncFile({
    path: SUPPLEMENT_DB_PATH,
    build: buildSupplementDatenbank,
    commitMessage: 'Sync: Supplement-Datenbank',
    importRemote: async (content) => {
      await importSupplementDatenbank(content)
    },
    tree,
  })
}
