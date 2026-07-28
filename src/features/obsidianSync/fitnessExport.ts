import { db } from '../../db/db'
import { addDays, isoDate } from '../../db/queries'
import { getSyncSettings } from './settings'
import { syncFile } from './githubApi'
import { syncErnaehrungLog, syncErnaehrungsplan } from './nutritionExport'
import { importGewicht, importSupplemente, importTraining } from './vaultImport'

function fmtNum(n: number | undefined): string {
  return n === undefined ? '' : String(n)
}

export const GEWICHT_PATH = '20-Fitness/Gewicht.md'
export const SUPPLEMENTE_PATH = '20-Fitness/Supplemente.md'
export const TRAINING_DIR = '20-Fitness/Training'

/** Baut Gewicht.md komplett neu aus allen gespeicherten Gewichtsdaten des gewählten Athleten. */
async function buildGewicht(): Promise<string> {
  const settings = getSyncSettings()
  if (!settings) throw new Error('Obsidian-Sync ist noch nicht eingerichtet.')

  const entries = await db.dailyEntries.where('athleteId').equals(settings.athleteId).toArray()
  const withWeight = entries
    .filter((e) => e.weightKg !== undefined)
    .sort((a, b) => b.date.localeCompare(a.date))

  const lines = [
    '---',
    'typ: gewicht',
    '---',
    '',
    '| Datum | Gewicht (kg) |',
    '| --- | --- |',
    ...withWeight.map((e) => `| ${e.date} | ${fmtNum(e.weightKg)} |`),
    '',
  ]

  return lines.join('\n')
}

/** Gleicht Gewicht.md in beide Richtungen ab. */
export async function syncGewicht(): Promise<void> {
  await syncFile({
    path: GEWICHT_PATH,
    build: buildGewicht,
    commitMessage: 'Sync: Gewichtsverlauf',
    importRemote: async (content) => {
      await importGewicht(content)
    },
  })
}

/** Baut die Trainingsdatei eines Tages - `null`, wenn an dem Tag nichts trainiert wurde. */
async function buildTraining(date: string): Promise<string | null> {
  const settings = getSyncSettings()
  if (!settings) throw new Error('Obsidian-Sync ist noch nicht eingerichtet.')

  const log = await db.workoutLogs.where('[athleteId+date]').equals([settings.athleteId, date]).first()
  if (!log) return null

  const plan = log.trainingPlanId ? await db.trainingPlans.get(log.trainingPlanId) : undefined
  const logExercises = await db.workoutLogExercises.where('workoutLogId').equals(log.id).sortBy('order')
  const exerciseDefs = await db.exercises.bulkGet(logExercises.map((e) => e.exerciseId))

  const exerciseLines: string[] = []
  for (let i = 0; i < logExercises.length; i++) {
    const ex = logExercises[i]
    const def = exerciseDefs[i]
    const sets = await db.workoutSets.where('workoutLogExerciseId').equals(ex.id).sortBy('setNumber')
    exerciseLines.push(`### ${def?.name ?? 'Unbekannte Übung'}`)
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

  const frontmatter = [
    '---',
    'typ: training',
    `datum: ${date}`,
    `plan: ${plan?.phaseName ?? 'ohne Plan'}`,
    `dauer_min: ${
      log.startedAt && log.completedAt
        ? Math.max(0, Math.round((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 60000))
        : ''
    }`,
    '---',
    '',
  ].join('\n')

  const body = exerciseLines.length > 0 ? exerciseLines.join('\n') : '_Keine Übungen erfasst._\n'
  return frontmatter + body
}

/** Gleicht die Trainingsdatei eines Tages in beide Richtungen ab (Standard: heute). */
export async function syncTraining(date: string): Promise<void> {
  await syncFile({
    path: `${TRAINING_DIR}/${date}.md`,
    build: () => buildTraining(date),
    commitMessage: `Sync ${date}: Training`,
    importRemote: async (content) => {
      await importTraining(date, content)
    },
  })
}

export async function syncTrainingHeute(): Promise<void> {
  await syncTraining(isoDate(new Date()))
}

/** Baut den aktuellen Supplementplan (erste Phase) des gewählten Athleten. */
async function buildSupplemente(): Promise<string> {
  const settings = getSyncSettings()
  if (!settings) throw new Error('Obsidian-Sync ist noch nicht eingerichtet.')

  const plans = await db.supplementPlans.where('athleteId').equals(settings.athleteId).sortBy('order')
  const currentPlan = plans[0]

  const lines = ['---', 'typ: supplemente', '---', '']
  if (!currentPlan) {
    lines.push('_Noch kein Supplementplan angelegt._', '')
  } else {
    lines.push(`## Aktueller Plan: ${currentPlan.phaseName}`, '')
    const items = await db.supplementPlanItems.where('planId').equals(currentPlan.id).toArray()
    const supplements = await db.supplements.bulkGet(items.map((i) => i.supplementId))
    if (items.length === 0) {
      lines.push('_Keine Supplemente im Plan._', '')
    } else {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const supplement = supplements[i]
        lines.push(`- **${supplement?.name ?? '?'}** – ${item.dose}, ${item.timing}${item.notes ? ` (${item.notes})` : ''}`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

/** Gleicht Supplemente.md in beide Richtungen ab. */
export async function syncSupplemente(): Promise<void> {
  await syncFile({
    path: SUPPLEMENTE_PATH,
    build: buildSupplemente,
    commitMessage: 'Sync: Supplementplan',
    importRemote: async (content) => {
      await importSupplemente(content)
    },
  })
}

/**
 * Tage, deren Tagesdateien der laufende Sync abgleicht. Mehr als heute, damit ein gestern
 * Abend in Obsidian nachgetragenes Training nicht bis zum "Kompletten Vault einlesen" wartet.
 */
const SYNCED_DAYS = 3

export function recentDates(today = isoDate(new Date())): string[] {
  return Array.from({ length: SYNCED_DAYS }, (_, i) => addDays(today, -i))
}

/** Führt alle Fitness- und Ernährungs-Abgleiche nacheinander aus. */
export async function syncFitnessHeute(): Promise<void> {
  await syncGewicht()
  await syncSupplemente()
  await syncErnaehrungsplan()
  for (const date of recentDates()) {
    await syncTraining(date)
    await syncErnaehrungLog(date)
  }
}
