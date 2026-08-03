import { getImportLog, requireSettings, resetImportLog } from './importLog'
import type { ImportResult } from './importLog'
import { listVaultTree, readFile, rememberRemoteSha } from './githubApi'
import type { RemoteFile } from './githubApi'
import { ATHLET_PATH, importAthlet } from './athleteExport'
import { UEBUNGEN_PATH, importUebungen } from './exerciseExport'
import { SUPPLEMENT_DB_PATH, importSupplementDatenbank } from './supplementDbExport'
import { LEBENSMITTEL_PATH, importLebensmittel, importLebensmittelNeu } from './foodExport'
import { TRAININGSPLAENE_PATH, importTrainingsplaene } from './trainingPlanExport'
import { GEWICHT_PATH, SUPPLEMENTE_PATH, TRAINING_DIR, recentDates } from './fitnessExport'
import { ERNAEHRUNGSPLAN_PATH, ERNAEHRUNG_LOG_DIR } from './nutritionExport'
import { importErnaehrungLog, importErnaehrungsplan, importGewicht, importSupplemente, importTraining } from './vaultImport'

/**
 * Liest den Vault ein: Stammdaten, Datenbanken und Pläne komplett, die Tagesdateien nur für
 * die letzten Tage (`recentDates`, dieselbe Spanne, die auch der laufende Sync abgleicht).
 *
 * Bewusst keine Vollhistorie: Jede Tagesdatei kostet eine eigene GitHub-Anfrage, ein Vault mit
 * einem Jahr Historie käme so auf hunderte davon und der Import würde minutenlang laufen. Für
 * ein neues Gerät gibt es "Backup aus Vault wiederherstellen" - das holt den kompletten
 * Datenbestand aus einer einzigen Datei.
 *
 * Die Reihenfolge ist wichtig: erst die Stammdaten und Datenbanken, dann die Pläne, dann die
 * Tagesdateien - so sind die dort per Namen referenzierten Übungen, Supplemente und Lebensmittel
 * bereits vorhanden und werden nicht als "unbekannt" übersprungen.
 */
export async function importRecentFromVault(): Promise<ImportResult[]> {
  requireSettings()
  resetImportLog()

  const tree = await listVaultTree()
  // Mit Dateibaum wissen wir vorab, was es überhaupt gibt - das erspart 404-Anfragen.
  const read = async (path: string): Promise<RemoteFile | null> => {
    if (tree && !tree.has(path)) return null
    const file = await readFile(path)
    // Stand merken, sonst hält der nächste Sync jede gerade gelesene Datei für verändert
    // und lädt sie ein zweites Mal.
    if (file) rememberRemoteSha(path, file.sha)
    return file
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

  // Gezielt die Pfade der letzten Tage lesen, statt die Verzeichnisse aufzulisten: Mit dem
  // Dateibaum kostet ein Tag ohne Datei gar keine Anfrage.
  for (const date of recentDates()) {
    const training = await read(`${TRAINING_DIR}/${date}.md`)
    if (training) await importTraining(date, training.content)

    const log = await read(`${ERNAEHRUNG_LOG_DIR}/${date}.md`)
    if (log) await importErnaehrungLog(date, log.content)
  }

  return getImportLog()
}
