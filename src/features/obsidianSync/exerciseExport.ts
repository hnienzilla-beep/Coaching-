import { db } from '../../db/db'
import type { Exercise } from '../../models/types'
import { byName, nameKey, record, requireSettings } from './importLog'
import type { ImportResult } from './importLog'
import { buildFrontmatter, fmtBool, tableRow, tableSeparator } from './markdownBuild'
import { parseUebungen } from './markdownParse'
import { syncFile } from './githubApi'
import type { VaultTree } from './githubApi'
import { withVaultImport } from './syncState'

/**
 * Übungs-Datenbank als Tabelle in `20-Fitness/Uebungen.md`.
 *
 * Die Namen stehen dort zeichengleich so wie in den Trainings-Tagesdateien - daran hängt die
 * Zuordnung beim Zurücklesen. Übungsbilder bleiben absichtlich außen vor: sie gehören nicht in
 * eine Markdowntabelle und würden den Vault unnötig aufblähen.
 */

export const UEBUNGEN_PATH = '20-Fitness/Uebungen.md'

const HEADER = ['Übung', 'Muskelgruppe', 'Favorit']

async function buildUebungen(): Promise<string> {
  const exercises = await db.exercises.toArray()
  const sorted = [...exercises].sort((a, b) => a.name.localeCompare(b.name, 'de'))

  return [
    ...buildFrontmatter({ typ: 'uebungen', quelle: 'fitness-app' }),
    '# Übungs-Datenbank',
    '',
    'Neue Zeilen werden beim nächsten Sync als Übung angelegt, geänderte Muskelgruppen und',
    'Favoriten übernommen. Hier gelöschte Zeilen löschen keine Übung - sie hängen an Plänen und',
    'Trainingslogs. Übungsbilder bleiben nur in der App.',
    '',
    tableRow(HEADER),
    tableSeparator(HEADER.length),
    ...sorted.map((e) => tableRow([e.name, e.muscleGroup, fmtBool(e.favorite)])),
    '',
  ].join('\n')
}

/**
 * Übernimmt die Übungs-Datenbank aus dem Vault: bekannte Namen werden aktualisiert, unbekannte
 * angelegt. Es wird nichts gelöscht - Übungen sind aus Trainingsplänen und Logs referenziert.
 * Eine unbekannte Muskelgruppe wird ignoriert (die App kennt nur die vorgesehenen Gruppen).
 */
export async function importUebungen(content: string): Promise<ImportResult> {
  const rows = parseUebungen(content)
  if (rows.length === 0) return record({ label: 'Übungen', changed: 0, skipped: [] })

  let changed = 0
  await withVaultImport(async () => {
    await db.transaction('rw', db.exercises, async () => {
      const existing = byName(await db.exercises.toArray())
      for (const row of rows) {
        const exercise = existing.get(nameKey(row.name))
        if (!exercise) {
          const created: Exercise = {
            id: crypto.randomUUID(),
            name: row.name,
            muscleGroup: row.muscleGroup ?? 'Sonstiges',
            ...(row.favorite ? { favorite: true } : {}),
          }
          await db.exercises.add(created)
          existing.set(nameKey(row.name), created)
          changed++
          continue
        }

        const patch: Partial<Exercise> = {}
        if (row.muscleGroup && row.muscleGroup !== exercise.muscleGroup) patch.muscleGroup = row.muscleGroup
        if (row.favorite !== !!exercise.favorite) patch.favorite = row.favorite
        if (Object.keys(patch).length === 0) continue
        await db.exercises.update(exercise.id, patch)
        changed++
      }
    })
  })

  return record({ label: 'Übungen', changed, skipped: [] })
}

/** Gleicht die Übungs-Datenbank in beide Richtungen ab. */
export async function syncUebungen(tree?: VaultTree | null): Promise<void> {
  requireSettings()
  await syncFile({
    path: UEBUNGEN_PATH,
    build: buildUebungen,
    commitMessage: 'Sync: Übungs-Datenbank',
    importRemote: async (content) => {
      await importUebungen(content)
    },
    tree,
  })
}
