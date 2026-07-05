import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { getLastExercisePerformance, getOrCreateWorkoutLog, isoDate } from '../db/queries'
import type { Athlete, TrainingPlanExercise, WorkoutSet } from '../models/types'
import { Button, Card, DecimalInput, Field, Select } from '../components/ui'
import SearchPicker from '../components/SearchPicker'
import RestTimer from '../components/RestTimer'
import StrengthChart from '../components/StrengthChart'

type Ctx = { athlete: Athlete }

async function createSetsFromPlanExercise(logExerciseId: string, pe: TrainingPlanExercise): Promise<void> {
  const repsNum = Number.parseInt(pe.reps, 10)
  const setsToCreate = Math.max(1, pe.sets)
  for (let i = 0; i < setsToCreate; i++) {
    await db.workoutSets.add({
      id: crypto.randomUUID(),
      workoutLogExerciseId: logExerciseId,
      setNumber: i + 1,
      reps: Number.isFinite(repsNum) ? repsNum : undefined,
      weightKg: pe.targetWeightKg,
    })
  }
}

export default function WorkoutLogPage() {
  const { athlete } = useOutletContext<Ctx>()
  const navigate = useNavigate()
  const logs = useLiveQuery(() => db.workoutLogs.where('athleteId').equals(athlete.id).reverse().sortBy('date'), [athlete.id])
  const trainingPlans = useLiveQuery(() => db.trainingPlans.where('athleteId').equals(athlete.id).sortBy('order'), [athlete.id])
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), [])

  const [selectedDate, setSelectedDate] = useState(isoDate(new Date()))
  const currentLog = logs?.find((l) => l.date === selectedDate)

  const rows = useLiveQuery(
    () => (currentLog ? db.workoutLogExercises.where('workoutLogId').equals(currentLog.id).toArray() : []),
    [currentLog?.id],
  )

  const planExercises = useLiveQuery(
    () =>
      currentLog?.trainingPlanId
        ? db.trainingPlanExercises.where('planId').equals(currentLog.trainingPlanId).sortBy('order')
        : [],
    [currentLog?.trainingPlanId],
  )

  const exerciseMap = new Map((exercises ?? []).map((e) => [e.id, e]))
  const pickerItems = (exercises ?? []).map((e) => ({ id: e.id, label: e.name, sublabel: e.muscleGroup }))
  const planMap = new Map((trainingPlans ?? []).map((p) => [p.id, p]))
  const planExerciseByExerciseId = new Map((planExercises ?? []).map((pe) => [pe.exerciseId, pe]))

  // Reihenfolge folgt dem Trainingsplan (order); Übungen ohne Plan-Zuordnung (z.B. manuell
  // ergänzt) bleiben ans Ende sortiert, sortierstabil in ihrer bisherigen Reihenfolge.
  const sortedRows = [...(rows ?? [])].sort((a, b) => {
    const orderA = planExerciseByExerciseId.get(a.exerciseId)?.order
    const orderB = planExerciseByExerciseId.get(b.exerciseId)?.order
    if (orderA !== undefined && orderB !== undefined) return orderA - orderB
    if (orderA !== undefined) return -1
    if (orderB !== undefined) return 1
    return 0
  })

  async function addExerciseRow() {
    if (!exercises?.length) return
    const log = await getOrCreateWorkoutLog(athlete.id, selectedDate)
    await db.workoutLogExercises.add({ id: crypto.randomUUID(), workoutLogId: log.id, exerciseId: exercises[0].id })
  }

  async function deleteExerciseRow(rowId: string) {
    await db.workoutSets.where('workoutLogExerciseId').equals(rowId).delete()
    await db.workoutLogExercises.delete(rowId)
  }

  async function setTrainingPlanId(planId: string) {
    const log = await getOrCreateWorkoutLog(athlete.id, selectedDate)
    await db.workoutLogs.update(log.id, { trainingPlanId: planId || undefined })
    if (!planId) return

    const planRows = await db.trainingPlanExercises.where('planId').equals(planId).sortBy('order')
    await db.transaction('rw', db.workoutLogExercises, db.workoutSets, async () => {
      const existingRows = await db.workoutLogExercises.where('workoutLogId').equals(log.id).toArray()
      const loggedExerciseIds = new Set(existingRows.map((r) => r.exerciseId))
      for (const pe of planRows) {
        if (loggedExerciseIds.has(pe.exerciseId)) continue
        const logExerciseId = crypto.randomUUID()
        await db.workoutLogExercises.add({ id: logExerciseId, workoutLogId: log.id, exerciseId: pe.exerciseId })
        await createSetsFromPlanExercise(logExerciseId, pe)
      }
    })
  }

  async function setNotes(notes: string) {
    const log = await getOrCreateWorkoutLog(athlete.id, selectedDate)
    await db.workoutLogs.update(log.id, { notes })
  }

  async function completeWorkout() {
    if (!currentLog) return
    await db.workoutLogs.update(currentLog.id, { completedAt: new Date().toISOString() })
    navigate(`/athlete/${athlete.id}`)
  }

  async function deleteLog() {
    if (!currentLog) return
    const logExercises = await db.workoutLogExercises.where('workoutLogId').equals(currentLog.id).toArray()
    for (const ex of logExercises) {
      await db.workoutSets.where('workoutLogExerciseId').equals(ex.id).delete()
    }
    await db.workoutLogExercises.where('workoutLogId').equals(currentLog.id).delete()
    await db.workoutLogs.delete(currentLog.id)
  }

  return (
    <div className="flex flex-col gap-4">
      <StrengthChart athleteId={athlete.id} />

      <RestTimer />

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Trainingseinheit {selectedDate}</h2>
          {currentLog && (
            <Button variant="danger" onClick={deleteLog}>
              Eintrag löschen
            </Button>
          )}
        </div>

        <Field label="Datum">
          <input
            type="date"
            value={selectedDate}
            max={isoDate(new Date())}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          />
        </Field>

        <Field label="Trainingstag (optional)">
          <Select value={currentLog?.trainingPlanId ?? ''} onChange={(e) => setTrainingPlanId(e.target.value)}>
            <option value="">– kein Plan zugeordnet –</option>
            {trainingPlans?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.phaseName}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex flex-col gap-2">
          {sortedRows.map((row) => (
            <WorkoutExerciseRow
              key={row.id}
              rowId={row.id}
              exerciseId={row.exerciseId}
              pickerItems={pickerItems}
              muscleGroup={exerciseMap.get(row.exerciseId)?.muscleGroup}
              planExercise={planExerciseByExerciseId.get(row.exerciseId)}
              athleteId={athlete.id}
              date={selectedDate}
              onDelete={() => deleteExerciseRow(row.id)}
            />
          ))}
        </div>

        <Button variant="secondary" onClick={addExerciseRow}>
          + Übung hinzufügen
        </Button>

        <Field label="Notizen">
          <textarea
            value={currentLog?.notes ?? ''}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          />
        </Field>

        {currentLog?.completedAt ? (
          <p className="text-center text-sm text-ok">
            ✓ Abgeschlossen am {new Date(currentLog.completedAt).toLocaleString('de-DE')}
          </p>
        ) : (
          <Button variant="primary" onClick={completeWorkout} disabled={!currentLog}>
            Training beenden
          </Button>
        )}
      </Card>

      <Card className="flex flex-col gap-1">
        <h2 className="pb-1 text-sm font-semibold uppercase tracking-wide text-muted">Verlauf</h2>
        {!logs?.length && <p className="text-sm text-muted">🏋️ Noch keine Trainingseinheiten aufgezeichnet.</p>}
        <div className="flex max-h-64 flex-col overflow-y-auto">
          {logs?.map((log) => (
            <button
              key={log.id}
              onClick={() => setSelectedDate(log.date)}
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm ${
                log.date === selectedDate ? 'bg-surface-2' : ''
              }`}
            >
              <span className="text-muted">{log.date}</span>
              <span className="text-fg">
                {log.completedAt ? '✓ ' : ''}
                {log.trainingPlanId ? planMap.get(log.trainingPlanId)?.phaseName : ''}
              </span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}

function WorkoutExerciseRow({
  rowId,
  exerciseId,
  pickerItems,
  muscleGroup,
  planExercise,
  athleteId,
  date,
  onDelete,
}: {
  rowId: string
  exerciseId: string
  pickerItems: { id: string; label: string; sublabel?: string }[]
  muscleGroup?: string
  planExercise?: TrainingPlanExercise
  athleteId: string
  date: string
  onDelete: () => void
}) {
  const sets = useLiveQuery(() => db.workoutSets.where('workoutLogExerciseId').equals(rowId).sortBy('setNumber'), [rowId]) ?? []
  const lastPerformance = useLiveQuery(
    () => getLastExercisePerformance(athleteId, exerciseId, date),
    [athleteId, exerciseId, date],
  )

  async function addSet() {
    const last = sets[sets.length - 1]
    let reps: number | undefined
    let weightKg: number | undefined
    if (last) {
      reps = last.reps
      weightKg = last.weightKg
    } else if (planExercise) {
      const repsNum = Number.parseInt(planExercise.reps, 10)
      reps = Number.isFinite(repsNum) ? repsNum : undefined
      weightKg = planExercise.targetWeightKg
    }
    const set: WorkoutSet = { id: crypto.randomUUID(), workoutLogExerciseId: rowId, setNumber: sets.length + 1, reps, weightKg }
    await db.workoutSets.add(set)
  }

  async function deleteSet(setId: string) {
    await db.workoutSets.delete(setId)
    const remaining = sets.filter((s) => s.id !== setId)
    await db.transaction('rw', db.workoutSets, async () => {
      for (let i = 0; i < remaining.length; i++) {
        await db.workoutSets.update(remaining[i].id, { setNumber: i + 1 })
      }
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-2">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <SearchPicker
            items={pickerItems}
            value={exerciseId}
            onChange={(id) => db.workoutLogExercises.update(rowId, { exerciseId: id })}
            placeholder="Übung suchen..."
          />
        </div>
        <Button variant="ghost" onClick={onDelete}>
          ✕
        </Button>
      </div>
      {muscleGroup && <div className="pl-1 text-xs text-muted">{muscleGroup}</div>}
      {lastPerformance && (
        <div className="pl-1 text-xs text-muted">
          Letztes Mal ({lastPerformance.date}): {lastPerformance.sets.map((s) => `${s.reps ?? '–'}×${s.weightKg ?? '–'} kg`).join(' · ')}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {sets.map((set) => (
          <div key={set.id} className={`flex items-center gap-2 ${set.done ? 'opacity-60' : ''}`}>
            <button
              type="button"
              onClick={() => db.workoutSets.update(set.id, { done: !set.done })}
              aria-label={set.done ? 'Satz als offen markieren' : 'Satz als erledigt markieren'}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm ${
                set.done ? 'border-accent bg-accent text-black' : 'border-border text-muted'
              }`}
            >
              ✓
            </button>
            <span className="w-14 shrink-0 text-xs text-muted">Satz {set.setNumber}</span>
            <input
              type="number"
              value={set.reps ?? ''}
              onChange={(e) => db.workoutSets.update(set.id, { reps: e.target.value === '' ? undefined : Number(e.target.value) })}
              placeholder="Wdh."
              className="w-16 min-w-0 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm text-fg outline-none focus:border-accent"
            />
            <div className="flex-1">
              <DecimalInput
                value={set.weightKg}
                onChange={(n) => db.workoutSets.update(set.id, { weightKg: n })}
                placeholder="Gewicht (kg)"
              />
            </div>
            <Button variant="ghost" onClick={() => deleteSet(set.id)}>
              ✕
            </Button>
          </div>
        ))}
      </div>

      <Button variant="ghost" onClick={addSet}>
        + Satz hinzufügen
      </Button>
    </div>
  )
}
