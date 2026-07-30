import { db } from '../../db/db'
import { isoDate } from '../../db/queries'
import type { FoodItem } from '../../models/types'
import { byName, nameKey, record, requireSettings } from './importLog'
import type { ImportResult } from './importLog'
import { getSyncSettings } from './settings'
import { hasRemoteChanged, readFile, rememberRemoteSha, syncFile, writeFile } from './githubApi'
import type { VaultTree } from './githubApi'
import { withVaultImport } from './syncState'
import { buildFrontmatter, fmtBool, tableRow, tableSeparator } from './markdownBuild'
import { isCurrentFormat, parseLebensmittel, parseLebensmittelNeu, rebuildLebensmittelNeu, splitTableRow } from './markdownParse'

export const LEBENSMITTEL_PATH = '40-Ernaehrung/Lebensmittel.md'
export const LEBENSMITTEL_NEU_PATH = '40-Ernaehrung/Lebensmittel-Neu.md'

const HEADER = ['Name', 'kcal', 'Protein', 'KH', 'Fett', 'Favorit', 'Unbestätigt']

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
    ...buildFrontmatter({ typ: 'lebensmittel', quelle: 'fitness-app' }),
    '# Lebensmittel-Datenbank',
    '',
    'Nährwerte je 100 g. Geänderte Werte und neue Zeilen übernimmt der nächste Sync; hier',
    'gelöschte Zeilen löschen kein Lebensmittel, weil Pläne und Tageslogs darauf verweisen.',
    'Ein Häkchen in "Unbestätigt" bedeutet: geschätzter Wert, in der App als solcher markiert.',
    '',
    tableRow(HEADER),
    tableSeparator(HEADER.length),
    ...sorted.map((f) =>
      tableRow([
        f.name,
        Math.round(f.kcal),
        f.protein.toFixed(1),
        f.carbs.toFixed(1),
        f.fat.toFixed(1),
        fmtBool(f.favorite),
        fmtBool(f.unconfirmed),
      ]),
    ),
    '',
  ].join('\n')
}

/** Vergleicht auf die geschriebene Genauigkeit - sonst gilt 7.04 gegen "7.0" als Änderung. */
function sameNumber(dbValue: number, fileValue: number, digits: number): boolean {
  return Number(dbValue.toFixed(digits)) === fileValue
}

/**
 * Übernimmt die Lebensmittel-Datenbank aus dem Vault. Anders als in den Tageslogs stehen hier die
 * Nährwerte dabei, die Tabelle ist also vollwertig rücklesbar: bekannte Namen werden aktualisiert,
 * unbekannte angelegt. Gelöscht wird nichts - Pläne und Logs verweisen auf die Einträge.
 *
 * Favorit und "Unbestätigt" werden nur aus Dateien übernommen, die diese Spalten überhaupt
 * kennen (`format:` im Frontmatter). Eine Tabelle aus einer älteren App-Version hätte sonst bei
 * jedem Lebensmittel beide Häkchen entfernt.
 */
export async function importLebensmittel(content: string): Promise<ImportResult> {
  const rows = parseLebensmittel(content)
  if (rows.length === 0) return record({ label: 'Lebensmittel', changed: 0, skipped: [] })
  const withFlags = isCurrentFormat(content)

  let changed = 0
  await withVaultImport(async () => {
    await db.transaction('rw', db.foodItems, async () => {
      const existing = byName(await db.foodItems.toArray())
      for (const row of rows) {
        const food = existing.get(nameKey(row.name))
        if (!food) {
          const created: FoodItem = {
            id: crypto.randomUUID(),
            name: row.name,
            kcal: row.kcal,
            protein: row.protein,
            carbs: row.carbs,
            fat: row.fat,
            ...(withFlags && row.favorite ? { favorite: true } : {}),
            ...(withFlags && row.unconfirmed ? { unconfirmed: true } : {}),
          }
          await db.foodItems.add(created)
          existing.set(nameKey(row.name), created)
          changed++
          continue
        }

        const patch: Partial<FoodItem> = {}
        if (!sameNumber(food.kcal, row.kcal, 0)) patch.kcal = row.kcal
        if (!sameNumber(food.protein, row.protein, 1)) patch.protein = row.protein
        if (!sameNumber(food.carbs, row.carbs, 1)) patch.carbs = row.carbs
        if (!sameNumber(food.fat, row.fat, 1)) patch.fat = row.fat
        if (withFlags) {
          if (row.favorite !== !!food.favorite) patch.favorite = row.favorite
          if (row.unconfirmed !== !!food.unconfirmed) patch.unconfirmed = row.unconfirmed
        }
        if (Object.keys(patch).length === 0) continue
        await db.foodItems.update(food.id, patch)
        changed++
      }
    })
  })

  return record({ label: 'Lebensmittel', changed, skipped: [] })
}

/**
 * Legt die in Lebensmittel-Neu.md vorgeschlagenen Lebensmittel in der Datenbank an und leert
 * anschließend die Tabelle in der Datei.
 *
 * - Namen, die es in der Datenbank schon gibt, werden verworfen: die Datenbank hat Vorrang,
 *   Schätzwerte dürfen gemessene Nährwerte nie überschreiben.
 * - Neue Einträge werden als `unconfirmed` markiert, damit in der App erkennbar bleibt, was
 *   geschätzt und nicht aus einer Nährwertquelle übernommen ist.
 * - Fehlerhafte Zeilen (falsche Spaltenzahl, nicht-numerische Werte) werden übersprungen und
 *   bleiben in der Datei stehen, statt den ganzen Import abzubrechen.
 *
 * `null`, wenn es die Datei im Vault nicht gibt oder ihre Tabelle leer ist.
 */
export async function importLebensmittelNeu(): Promise<ImportResult | null> {
  requireSettings()
  const remote = await readFile(LEBENSMITTEL_NEU_PATH)
  if (!remote) return null

  const rows = parseLebensmittelNeu(remote.content)
  if (rows.length === 0) {
    // Leere Tabelle: Stand merken, damit der nächste Sync die Datei nicht wieder liest.
    rememberRemoteSha(LEBENSMITTEL_NEU_PATH, remote.sha)
    return null
  }

  const keptLines: string[] = []
  const skipped: string[] = []
  let changed = 0

  await withVaultImport(async () => {
    await db.transaction('rw', db.foodItems, async () => {
      const existing = byName(await db.foodItems.toArray())
      for (const row of rows) {
        if (!row.food) {
          keptLines.push(row.line)
          skipped.push(splitTableRow(row.line)[0] || row.line.trim())
          continue
        }
        const key = nameKey(row.food.name)
        if (existing.has(key)) continue // schon in der Datenbank - Zeile verwerfen
        const item: FoodItem = {
          id: crypto.randomUUID(),
          name: row.food.name,
          kcal: row.food.kcal,
          protein: row.food.protein,
          carbs: row.food.carbs,
          fat: row.food.fat,
          unconfirmed: true,
        }
        await db.foodItems.add(item)
        existing.set(key, item)
        changed++
      }
    })
  })

  const emptied = rebuildLebensmittelNeu(remote.content, keptLines)
  if (emptied !== null) {
    await writeFile(LEBENSMITTEL_NEU_PATH, emptied, `Sync ${isoDate(new Date())}: Lebensmittel-Neu`, remote.sha)
  } else {
    rememberRemoteSha(LEBENSMITTEL_NEU_PATH, remote.sha)
  }

  return record({ label: 'Neue Lebensmittel', changed, skipped })
}

/**
 * Gleicht die Lebensmitteldatenbank mit dem Vault ab.
 *
 * Erst der Import aus Lebensmittel-Neu.md, dann der Abgleich von Lebensmittel.md - so tauchen neu
 * angelegte Lebensmittel schon im selben Sync-Durchlauf in der Tabelle auf.
 */
export async function syncLebensmittel(tree?: VaultTree | null): Promise<void> {
  const settings = getSyncSettings()
  // Die Datei entsteht in Obsidian, kann also nicht aus der App gebaut und damit auch nicht über
  // `syncFile` abgeglichen werden - deshalb hier der eigene "hat sich was geändert?"-Vergleich.
  if (settings?.importFromVault && hasRemoteChanged(LEBENSMITTEL_NEU_PATH, tree)) {
    await importLebensmittelNeu()
  }

  await syncFile({
    path: LEBENSMITTEL_PATH,
    build: buildLebensmittel,
    commitMessage: `Sync ${isoDate(new Date())}: Lebensmittel-Datenbank`,
    importRemote: async (content) => {
      await importLebensmittel(content)
    },
    // Reiner Datenbankabzug mit erklärendem Vorspann - hier gibt es keinen Notizen-Block, der
    // erhalten bleiben müsste.
    preserveNotes: false,
    tree,
  })
}
