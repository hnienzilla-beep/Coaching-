import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { getOrCreateWorkoutLog, isoDate } from '../db/queries'
import type { Athlete } from '../models/types'
import { Button, Card, DecimalInput, Field, Select } from '../components/ui'
import SearchPicker from '../components/SearchPicker'

type Ctx = { athlete: Athlete }

export default function WorkoutLogPage() {
  const { athlete } = useOutletContext<Ctx>()
  const logs = useLiveQuery(() => db.workoutLogs.where('athleteId').equals(athlete.id).reverse().sortBy('date'), [athlete.id])
  const trainingPlans = useLiveQuery(() => db.trainingPlans.where('athleteId').equals(athlete.id).sortBy('order'), [athlete.id])
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), [])

  const [selectedDate, setSelectedDate] = useState(isoDate(new Date()))
  const currentLog = logs?.find((l) => l.date === selectedDate)

  const rows = useLiveQuery(
    () => (currentLog ? db.workoutLogExercises.where('workoutLogId').equals(currentLog.id).toArray() : []),
    [currentLog?.id],
  )

  const exerciseMap = new Map((exercises ?? []).map((e) => [e.id, e]))
  const pickerItems = (exercises ?? []).map((e) => ({ id: e.id, label: e.name, sublabel: e.muscleGroup }))
  const planMap = new Map((trainingPlans ?? []).map((p) => [p.id, p]))

  async function addExerciseRow() {
    if (!exercises?.length) return
    const log = await getOrCreateWorkoutLog(athlete.id, selectedDate)
    await db.workoutLogExercises.add({
      id: crypto.randomUUID(),
      workoutLogId: log.id,
      exerciseId: exercises[0].id,
      sets: 3,
      reps: '8-12',
    })
  }

  async function setTrainingPlanId(planId: string) {
    const log = await getOrCreateWorkoutLog(athlete.id, selectedDate)
    await db.workoutLogs.update(log.id, { trainingPlanId: planId || undefined })
  }

  async function setNotes(notes: string) {
    const log = await getOrCreateWorkoutLog(athlete.id, selectedDate)
    await db.workoutLogs.update(log.id, { notes })
  }

  async function deleteLog() {
    if (!currentLog) return
    await db.workoutLogExercises.where('workoutLogId').equals(currentLog.id).delete()
    await db.workoutLogs.delete(currentLog.id)
  }

  return (
    <div className="flex flex-col gap-4">
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
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-accent"
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
          {(rows ?? []).map((row) => (
            <div key={row.id} className="flex flex-col gap-2 rounded-lg border border-border p-2">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <SearchPicker
                    items={pickerItems}
                    value={row.exerciseId}
                    onChange={(id) => db.workoutLogExercises.update(row.id, { exerciseId: id })}
                    placeholder="Übung suchen..."
                  />
                </div>
                <Button variant="ghost" onClick={() => db.workoutLogExercises.delete(row.id)}>
                  ✕
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={row.sets}
                  onChange={(e) => db.workoutLogExercises.update(row.id, { sets: Number(e.target.value) })}
                  placeholder="Sätze"
                  className="w-16 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-accent"
                />
                <input
                  value={row.reps}
                  onChange={(e) => db.workoutLogExercises.update(row.id, { reps: e.target.value })}
                  placeholder="Wdh."
                  className="w-20 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-accent"
                />
                <div className="flex-1">
                  <DecimalInput
                    value={row.weightKg}
                    onChange={(n) => db.workoutLogExercises.update(row.id, { weightKg: n })}
                    placeholder="Gewicht (kg)"
                  />
                </div>
              </div>
              {exerciseMap.get(row.exerciseId)?.muscleGroup && (
                <div className="pl-1 text-xs text-muted">{exerciseMap.get(row.exerciseId)?.muscleGroup}</div>
              )}
            </div>
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
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-accent"
          />
        </Field>
      </Card>

      <Card className="flex flex-col gap-1">
        <h2 className="pb-1 text-sm font-semibold uppercase tracking-wide text-muted">Verlauf</h2>
        {!logs?.length && <p className="text-sm text-muted">Noch keine Trainingseinheiten aufgezeichnet.</p>}
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
              <span className="text-zinc-100">{log.trainingPlanId ? planMap.get(log.trainingPlanId)?.phaseName : ''}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}
