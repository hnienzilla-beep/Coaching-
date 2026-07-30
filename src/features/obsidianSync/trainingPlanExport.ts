import { db } from '../../db/db'
import type { Exercise, TrainingPlan } from '../../models/types'
import { byName, nameKey, record, requireSettings } from './importLog'
import type { ImportResult } from './importLog'
import { buildFrontmatter, fmtNum, tableRow, tableSeparator } from './markdownBuild'
import { parseTrainingsplaene } from './markdownParse'
import { syncFile } from './githubApi'
import type { VaultTree } from './githubApi'
import { withVaultImport } from './syncState'

/**
 * Trainingspläne (alle Phasen des Athleten) in `20-Fitness/Trainingsplaene.md` - je Phase eine
 * Überschrift "## Plan: <Name>" und darunter eine Tabelle mit den geplanten Übungen.
 *
 * Die Phase wird beim Zurücklesen über ihren Namen wiedergefunden, damit die Plan-ID und damit
 * die Verknüpfung aus den Trainingslogs (`WorkoutLog.trainingPlanId`) erhalten bleibt.
 */

export const TRAININGSPLAENE_PATH = '20-Fitness/Trainingsplaene.md'

const HEADER = ['Übung', 'Sätze', 'Wdh.', 'Zielgewicht (kg)', 'Notiz']

async function buildTrainingsplaene(): Promise<string> {
  const settings = requireSettings()
  const plans = await db.trainingPlans.where('athleteId').equals(settings.athleteId).sortBy('order')

  const lines = [
    ...buildFrontmatter({ typ: 'trainingsplaene' }),
    '# Trainingspläne',
    '',
    'Zeilen dürfen hier geändert, ergänzt und gelöscht werden - beim nächsten Sync steht die',
    'Tabelle genau so in der App. Eine hier fehlende Phase bleibt in der App erhalten; Phasen',
    'werden nur in der App gelöscht.',
    '',
  ]

  if (plans.length === 0) {
    lines.push('_Noch kein Trainingsplan angelegt._', '')
    return lines.join('\n')
  }

  for (const plan of plans) {
    const rows = await db.trainingPlanExercises.where('planId').equals(plan.id).sortBy('order')
    const exercises = await db.exercises.bulkGet(rows.map((r) => r.exerciseId))
    lines.push(`## Plan: ${plan.phaseName}`, '')
    if (rows.length === 0) {
      lines.push('_Keine Übungen im Plan._', '')
      continue
    }
    lines.push(tableRow(HEADER), tableSeparator(HEADER.length))
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      lines.push(
        tableRow([exercises[i]?.name ?? '?', row.sets, row.reps, fmtNum(row.targetWeightKg), row.notes]),
      )
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Übernimmt die Trainingspläne aus dem Vault.
 *
 * - Phasen werden über ihren Namen zugeordnet; eine im Vault neue Phase wird angelegt.
 * - Die Übungen einer Phase werden komplett ersetzt, damit im Vault gelöschte Zeilen wirken.
 * - Eine Phase, die in der Datei nicht vorkommt, bleibt unangetastet - ein umgeräumter oder
 *   halb geschriebener Vault soll keinen Plan verlieren.
 * - Unbekannte Übungen werden angelegt (Muskelgruppe zunächst "Sonstiges"), wie beim Import der
 *   Trainings-Tagesdateien.
 */
export async function importTrainingsplaene(content: string): Promise<ImportResult> {
  const settings = requireSettings()
  const phases = parseTrainingsplaene(content).filter((phase) => phase.items.length > 0)
  if (phases.length === 0) return record({ label: 'Trainingspläne', changed: 0, skipped: [] })

  let changed = 0
  await withVaultImport(async () => {
    await db.transaction('rw', db.trainingPlans, db.trainingPlanExercises, db.exercises, async () => {
      const plans = await db.trainingPlans.where('athleteId').equals(settings.athleteId).sortBy('order')
      const planByName = new Map(plans.map((p) => [nameKey(p.phaseName), p]))
      const exerciseMap = byName(await db.exercises.toArray())
      let nextOrder = plans.length

      for (const phase of phases) {
        let plan: TrainingPlan | undefined = planByName.get(nameKey(phase.phaseName))
        if (!plan) {
          plan = {
            id: crypto.randomUUID(),
            athleteId: settings.athleteId,
            phaseName: phase.phaseName,
            order: nextOrder++,
          }
          await db.trainingPlans.add(plan)
          planByName.set(nameKey(phase.phaseName), plan)
        }

        await db.trainingPlanExercises.where('planId').equals(plan.id).delete()

        let order = 0
        for (const item of phase.items) {
          const key = nameKey(item.name)
          let exercise: Exercise | undefined = exerciseMap.get(key)
          if (!exercise) {
            exercise = { id: crypto.randomUUID(), name: item.name.trim(), muscleGroup: 'Sonstiges' }
            await db.exercises.add(exercise)
            exerciseMap.set(key, exercise)
          }
          await db.trainingPlanExercises.add({
            id: crypto.randomUUID(),
            planId: plan.id,
            exerciseId: exercise.id,
            order: order++,
            sets: item.sets,
            reps: item.reps,
            targetWeightKg: item.targetWeightKg,
            notes: item.notes,
          })
          changed++
        }
      }
    })
  })

  return record({ label: 'Trainingspläne', changed, skipped: [] })
}

/** Gleicht die Trainingspläne in beide Richtungen ab. */
export async function syncTrainingsplaene(tree?: VaultTree | null): Promise<void> {
  await syncFile({
    path: TRAININGSPLAENE_PATH,
    build: buildTrainingsplaene,
    commitMessage: 'Sync: Trainingspläne',
    importRemote: async (content) => {
      await importTrainingsplaene(content)
    },
    tree,
  })
}
