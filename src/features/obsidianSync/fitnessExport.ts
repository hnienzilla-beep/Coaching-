import { db } from '../../db/db'
import { addDays, todayIso } from '../../db/queries'
import { requireSettings } from './importLog'
import { buildFrontmatter, fmtNum, tableRow, tableSeparator } from './markdownBuild'
import { listVaultTree, syncFile } from './githubApi'
import type { VaultTree } from './githubApi'
import { syncAthlet } from './athleteExport'
import { syncUebungen } from './exerciseExport'
import { syncSupplementDatenbank } from './supplementDbExport'
import { syncTrainingsplaene } from './trainingPlanExport'
import { syncLebensmittel } from './foodExport'
import { syncBackup } from './backupExport'
import { syncErnaehrungLog, syncErnaehrungsplan } from './nutritionExport'
import { TRACKING_FIELDS, importGewicht, importSupplemente, importTraining } from './vaultImport'

export const GEWICHT_PATH = '20-Fitness/Gewicht.md'
export const SUPPLEMENTE_PATH = '20-Fitness/Supplemente.md'
export const TRAINING_DIR = '20-Fitness/Training'

const TRACKING_HEADER = [
  'Datum',
  'Gewicht (kg)',
  'KFA (%)',
  'kcal',
  'Protein (g)',
  'KH (g)',
  'Fett (g)',
  'Bauch (cm)',
  'Arm (cm)',
  'Brust (cm)',
  'Bein (cm)',
  'Notiz',
]

/**
 * Baut Gewicht.md komplett neu aus den Tracking-Daten des gewählten Athleten: Gewicht,
 * Körperfettanteil, Kalorien/Makros, Umfänge und Tagesnotiz.
 *
 * Datum und Gewicht stehen bewusst in Spalte 1 und 2 - so bleibt die Datei mit den Tabellen
 * kompatibel, die frühere App-Versionen geschrieben haben.
 */
async function buildGewicht(): Promise<string> {
  const settings = requireSettings()

  const entries = await db.dailyEntries.where('athleteId').equals(settings.athleteId).toArray()
  // Tage ohne einen einzigen Wert würden nur eine leere Zeile erzeugen.
  const relevant = entries
    .filter((e) => TRACKING_FIELDS.some((field) => e[field] !== undefined && e[field] !== ''))
    .sort((a, b) => b.date.localeCompare(a.date))

  return [
    ...buildFrontmatter({ typ: 'gewicht' }),
    '# Tracking',
    '',
    'Zeilen dürfen hier geändert und ergänzt werden. Eine leere Zelle lässt den Wert in der App',
    'unangetastet, eine hier fehlende Zeile löscht keinen Tag - gelöscht wird nur in der App.',
    '',
    tableRow(TRACKING_HEADER),
    tableSeparator(TRACKING_HEADER.length),
    ...relevant.map((e) =>
      tableRow([
        e.date,
        fmtNum(e.weightKg),
        fmtNum(e.bodyFatPct),
        fmtNum(e.calories),
        fmtNum(e.protein),
        fmtNum(e.carbs),
        fmtNum(e.fat),
        fmtNum(e.waist),
        fmtNum(e.arm),
        fmtNum(e.chest),
        fmtNum(e.leg),
        e.notes,
      ]),
    ),
    '',
  ].join('\n')
}

/** Gleicht Gewicht.md in beide Richtungen ab. */
export async function syncGewicht(tree?: VaultTree | null): Promise<void> {
  await syncFile({
    path: GEWICHT_PATH,
    build: buildGewicht,
    commitMessage: 'Sync: Tracking',
    importRemote: async (content) => {
      await importGewicht(content)
    },
    tree,
  })
}

/** Baut die Trainingsdatei eines Tages - `null`, wenn an dem Tag nichts trainiert wurde. */
async function buildTraining(date: string): Promise<string | null> {
  const settings = requireSettings()

  const log = await db.workoutLogs.where('[athleteId+date]').equals([settings.athleteId, date]).first()
  if (!log) return null

  const plan = log.trainingPlanId ? await db.trainingPlans.get(log.trainingPlanId) : undefined
  // Eine im Log angelegte, aber noch nicht ausgefüllte Übungszeile hat keine exerciseId -
  // die gehört nicht als "Unbekannte Übung" in den Vault.
  const logExercises = (await db.workoutLogExercises.where('workoutLogId').equals(log.id).sortBy('order')).filter(
    (e) => e.exerciseId !== '',
  )
  const exerciseDefs = await db.exercises.bulkGet(logExercises.map((e) => e.exerciseId))

  const exerciseLines: string[] = []
  for (let i = 0; i < logExercises.length; i++) {
    const ex = logExercises[i]
    const def = exerciseDefs[i]
    const sets = await db.workoutSets.where('workoutLogExerciseId').equals(ex.id).sortBy('setNumber')
    exerciseLines.push(`### ${def?.name ?? 'Unbekannte Übung'}`)
    if (ex.notes) exerciseLines.push(`_Notiz: ${ex.notes.replace(/\r?\n/g, ' ')}_`)
    if (sets.length === 0) {
      exerciseLines.push('_Keine Sätze erfasst._')
    } else {
      for (const s of sets) {
        const parts = [`Satz ${s.setNumber}`]
        if (s.reps !== undefined) parts.push(`${s.reps} Wdh.`)
        if (s.weightKg !== undefined) parts.push(`${s.weightKg} kg`)
        if (s.rpe !== undefined) parts.push(`RPE ${s.rpe}`)
        exerciseLines.push(`- ${s.done ? '[x]' : '[ ]'} ${parts.join(' · ')}`)
      }
    }
    exerciseLines.push('')
  }

  if (exerciseLines.length === 0) exerciseLines.push('_Keine Übungen erfasst._', '')

  // Die Trainingsnotiz gehört zum Log und wird zurückgelesen - anders als der "## Notizen"-Block,
  // der allein dem Nutzer gehört.
  if (log.notes) exerciseLines.push('## Trainingsnotiz', '', log.notes, '')

  const durationMin =
    log.startedAt && log.completedAt
      ? Math.max(0, Math.round((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 60000))
      : undefined

  return [
    ...buildFrontmatter({
      typ: 'training',
      datum: date,
      plan: plan?.phaseName ?? 'ohne Plan',
      start: log.startedAt,
      ende: log.completedAt,
      dauer_min: durationMin,
    }),
    ...exerciseLines,
  ].join('\n')
}

/** Gleicht die Trainingsdatei eines Tages in beide Richtungen ab. */
export async function syncTraining(date: string, tree?: VaultTree | null): Promise<void> {
  await syncFile({
    path: `${TRAINING_DIR}/${date}.md`,
    build: () => buildTraining(date),
    commitMessage: `Sync ${date}: Training`,
    importRemote: async (content) => {
      await importTraining(date, content)
    },
    tree,
  })
}

/** Baut alle Supplementplan-Phasen des gewählten Athleten. */
async function buildSupplemente(): Promise<string> {
  const settings = requireSettings()

  const plans = await db.supplementPlans.where('athleteId').equals(settings.athleteId).sortBy('order')

  const lines = [...buildFrontmatter({ typ: 'supplemente' })]
  if (plans.length === 0) {
    lines.push('_Noch kein Supplementplan angelegt._', '')
    return lines.join('\n')
  }

  for (const plan of plans) {
    lines.push(`## Plan: ${plan.phaseName}`, '')
    // Noch nicht ausgefüllte Zeilen haben keine supplementId - sie gehören nicht in den Vault.
    const items = (await db.supplementPlanItems.where('planId').equals(plan.id).toArray()).filter(
      (i) => i.supplementId !== '',
    )
    const supplements = await db.supplements.bulkGet(items.map((i) => i.supplementId))
    if (items.length === 0) {
      lines.push('_Keine Supplemente im Plan._', '')
      continue
    }
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const supplement = supplements[i]
      lines.push(`- **${supplement?.name ?? '?'}** – ${item.dose}, ${item.timing}${item.notes ? ` (${item.notes})` : ''}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/** Gleicht Supplemente.md in beide Richtungen ab. */
export async function syncSupplemente(tree?: VaultTree | null): Promise<void> {
  await syncFile({
    path: SUPPLEMENTE_PATH,
    build: buildSupplemente,
    commitMessage: 'Sync: Supplementplan',
    importRemote: async (content) => {
      await importSupplemente(content)
    },
    tree,
  })
}

/**
 * Tage, die immer mit abgeglichen werden - auch wenn es dafür (noch) keine Daten gibt. Damit
 * kommt ein gestern Abend in Obsidian nachgetragenes Training auch dann in die App, wenn die App
 * für diesen Tag selbst nichts zu schreiben hätte.
 */
const SYNCED_DAYS = 3

export function recentDates(today = todayIso()): string[] {
  return Array.from({ length: SYNCED_DAYS }, (_, i) => addDays(today, -i))
}

/**
 * Alle Tage, für die es abzugleichen gibt: jeder Tag mit Trainings- oder Ernährungslog plus die
 * letzten Tage. Absteigend sortiert, damit bei einem Abbruch (kein Netz) das Aktuelle steht.
 */
async function datesToSync(athleteId: string): Promise<string[]> {
  const [workouts, nutrition] = await Promise.all([
    db.workoutLogs.where('athleteId').equals(athleteId).toArray(),
    db.nutritionLogs.where('athleteId').equals(athleteId).toArray(),
  ])
  const dates = new Set<string>(recentDates())
  for (const log of workouts) dates.add(log.date)
  for (const log of nutrition) dates.add(log.date)
  return [...dates].sort((a, b) => b.localeCompare(a))
}

/**
 * Gleicht den kompletten Datenbestand des gewählten Athleten mit dem Vault ab - Stammdaten,
 * Datenbanken, Pläne, die gesamte Tageshistorie und das JSON-Vollbackup.
 *
 * Der Dateibaum des Repos wird einmal am Anfang geholt: Damit überspringt `syncFile` jede Datei,
 * die sich weder im Vault noch in der App geändert hat, ohne weitere GitHub-Anfrage - erst das
 * macht die komplette Historie in jedem Durchlauf bezahlbar.
 */
export async function syncVault(): Promise<void> {
  const settings = requireSettings()
  const tree = await listVaultTree()

  await syncAthlet(tree)
  await syncGewicht(tree)
  // Vor den Plänen und Tageslogs: die dort verwendeten Übungen, Supplemente und Lebensmittel
  // lassen sich danach schon im selben Durchlauf zuordnen, statt als "unbekannt" zu gelten.
  await syncUebungen(tree)
  await syncSupplementDatenbank(tree)
  await syncLebensmittel(tree)
  await syncTrainingsplaene(tree)
  await syncSupplemente(tree)
  await syncErnaehrungsplan(tree)

  for (const date of await datesToSync(settings.athleteId)) {
    await syncTraining(date, tree)
    await syncErnaehrungLog(date, tree)
  }

  // Zum Schluss, damit das Backup den Stand nach allen Vault-Importen dieses Durchlaufs enthält.
  await syncBackup(tree)
}
