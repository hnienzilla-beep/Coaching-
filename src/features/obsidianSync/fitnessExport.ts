import { db } from '../../db/db'
import { isoDate } from '../../db/queries'
import { getSyncSettings } from './settings'
import { upsertFile } from './githubApi'
import { syncErnaehrungAlles } from './nutritionExport'

function fmtNum(n: number | undefined): string {
  return n === undefined ? '' : String(n)
}

/** Baut Gewicht.md komplett neu aus allen gespeicherten Gewichtsdaten des gewählten Athleten. */
export async function syncGewicht(): Promise<void> {
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

  await upsertFile('20-Fitness/Gewicht.md', lines.join('\n'), 'Sync: Gewichtsverlauf')
}

/** Exportiert das heutige Training (falls vorhanden) nach 20-Fitness/Training/JJJJ-MM-TT.md. */
export async function syncTrainingHeute(): Promise<void> {
  const settings = getSyncSettings()
  if (!settings) throw new Error('Obsidian-Sync ist noch nicht eingerichtet.')

  const today = isoDate(new Date())
  const log = await db.workoutLogs
    .where('[athleteId+date]')
    .equals([settings.athleteId, today])
    .first()
  if (!log) return // kein Training heute - nichts zu exportieren

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
    `datum: ${today}`,
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

  await upsertFile(`20-Fitness/Training/${today}.md`, frontmatter + body, `Sync ${today}: Training`)
}

/** Schreibt den aktuellen Supplementplan (erste Phase) des gewählten Athleten. */
export async function syncSupplemente(): Promise<void> {
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

  await upsertFile('20-Fitness/Supplemente.md', lines.join('\n'), 'Sync: Supplementplan')
}

/** Führt alle Fitness- und Ernährungs-Exports nacheinander aus. */
export async function syncFitnessHeute(): Promise<void> {
  await syncGewicht()
  await syncTrainingHeute()
  await syncSupplemente()
  await syncErnaehrungAlles()
}
