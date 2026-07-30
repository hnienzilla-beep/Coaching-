import { getImportLog, requireSettings, resetImportLog } from './importLog'
import type { ImportResult } from './importLog'
import { listMarkdownFiles, listVaultTree, readFile } from './githubApi'
import type { RemoteFile, VaultTree } from './githubApi'
import { ATHLET_PATH, importAthlet } from './athleteExport'
import { UEBUNGEN_PATH, importUebungen } from './exerciseExport'
import { SUPPLEMENT_DB_PATH, importSupplementDatenbank } from './supplementDbExport'
import { LEBENSMITTEL_PATH, importLebensmittel, importLebensmittelNeu } from './foodExport'
import { TRAININGSPLAENE_PATH, importTrainingsplaene } from './trainingPlanExport'
import { GEWICHT_PATH, SUPPLEMENTE_PATH, TRAINING_DIR } from './fitnessExport'
import { ERNAEHRUNGSPLAN_PATH, ERNAEHRUNG_LOG_DIR } from './nutritionExport'
import { dateFromPath, importErnaehrungLog, importErnaehrungsplan, importGewicht, importSupplemente, importTraining } from './vaultImport'

/**
 * Liest den kompletten Vault ein - alle Dateien, auch Tage, die schon lange zurückliegen.
 * Gedacht für "Kompletten Vault einlesen" (neues Gerät, Wiederherstellung).
 *
 * Die Reihenfolge ist wichtig: erst die Stammdaten und Datenbanken, dann die Pläne, dann die
 * Tagesdateien - so sind die dort per Namen referenzierten Übungen, Supplemente und Lebensmittel
 * bereits vorhanden und werden nicht als "unbekannt" übersprungen.
 */
export async function importAllFromVault(): Promise<ImportResult[]> {
  requireSettings()
  resetImportLog()

  const tree = await listVaultTree()
  // Mit Dateibaum wissen wir vorab, was es überhaupt gibt - das erspart 404-Anfragen.
  const read = async (path: string): Promise<RemoteFile | null> => {
    if (tree && !tree.has(path)) return null
    return await readFile(path)
  }

  const athlet = await read(ATHLET_PATH)
  if (athlet) await importAthlet(athlet.content)

  const uebungen = await read(UEBUNGEN_PATH)
  if (uebungen) await importUebungen(uebungen.content)

  const supplementDb = await read(SUPPLEMENT_DB_PATH)
  if (supplementDb) await importSupplementDatenbank(supplementDb.content)

  const lebensmittel = await read(LEBENSMITTEL_PATH)
  if (lebensmittel) await importLebensmittel(lebensmittel.content)
  await importLebensmittelNeu()

  const trainingsplaene = await read(TRAININGSPLAENE_PATH)
  if (trainingsplaene) await importTrainingsplaene(trainingsplaene.content)

  const gewicht = await read(GEWICHT_PATH)
  if (gewicht) await importGewicht(gewicht.content)

  const supplemente = await read(SUPPLEMENTE_PATH)
  if (supplemente) await importSupplemente(supplemente.content)

  const plan = await read(ERNAEHRUNGSPLAN_PATH)
  if (plan) await importErnaehrungsplan(plan.content)

  for (const path of await markdownFilesIn(TRAINING_DIR, tree)) {
    const date = dateFromPath(path)
    if (!date) continue
    const file = await readFile(path)
    if (file) await importTraining(date, file.content)
  }

  for (const path of await markdownFilesIn(ERNAEHRUNG_LOG_DIR, tree)) {
    const date = dateFromPath(path)
    if (!date) continue
    const file = await readFile(path)
    if (file) await importErnaehrungLog(date, file.content)
  }

  return getImportLog()
}

/** Dateien eines Verzeichnisses - aus dem Baum, wenn er da ist, sonst über die Contents-API. */
async function markdownFilesIn(dir: string, tree: VaultTree | null): Promise<string[]> {
  if (!tree) return await listMarkdownFiles(dir)
  return [...tree.keys()].filter((path) => path.startsWith(`${dir}/`) && path.endsWith('.md')).sort()
}
