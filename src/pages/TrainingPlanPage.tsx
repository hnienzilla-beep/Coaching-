import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Athlete, TrainingPlanExercise } from '../models/types'
import { Button, Card, DecimalInput } from '../components/ui'
import SearchPicker from '../components/SearchPicker'

type Ctx = { athlete: Athlete }

export default function TrainingPlanPage() {
  const { athlete } = useOutletContext<Ctx>()
  const plans = useLiveQuery(() => db.trainingPlans.where('athleteId').equals(athlete.id).sortBy('order'), [athlete.id])
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), [])
  const [activePlanId, setActivePlanId] = useState<string | null>(null)

  const currentPlanId = activePlanId ?? plans?.[0]?.id ?? null
  const activePlan = plans?.find((p) => p.id === currentPlanId)

  const rows = useLiveQuery(
    () => (currentPlanId ? db.trainingPlanExercises.where('planId').equals(currentPlanId).toArray() : []),
    [currentPlanId],
  )

  const exerciseMap = new Map((exercises ?? []).map((e) => [e.id, e]))
  const pickerItems = (exercises ?? []).map((e) => ({ id: e.id, label: e.name, sublabel: e.muscleGroup }))

  async function addPhase() {
    const order = plans?.length ?? 0
    const id = crypto.randomUUID()
    await db.trainingPlans.add({ id, athleteId: athlete.id, phaseName: `Tag ${String.fromCharCode(65 + order)}`, order })
    setActivePlanId(id)
  }

  async function deletePhase(planId: string) {
    await db.trainingPlanExercises.where('planId').equals(planId).delete()
    await db.trainingPlans.delete(planId)
    setActivePlanId(null)
  }

  async function renamePhase(planId: string, name: string) {
    await db.trainingPlans.update(planId, { phaseName: name })
  }

  async function addRow() {
    if (!currentPlanId || !exercises?.length) return
    const row: TrainingPlanExercise = {
      id: crypto.randomUUID(),
      planId: currentPlanId,
      exerciseId: exercises[0].id,
      sets: 3,
      reps: '8-12',
    }
    await db.trainingPlanExercises.add(row)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {plans?.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePlanId(p.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
              p.id === currentPlanId ? 'bg-accent text-black font-medium' : 'bg-surface-2 text-muted'
            }`}
          >
            {p.phaseName}
          </button>
        ))}
        <button onClick={addPhase} className="shrink-0 rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted">
          + Tag
        </button>
      </div>

      {activePlan && (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input
              value={activePlan.phaseName}
              onChange={(e) => renamePhase(activePlan.id, e.target.value)}
              className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm font-semibold text-zinc-100 outline-none focus:border-accent"
            />
            {plans && plans.length > 1 && (
              <Button variant="danger" onClick={() => deletePhase(activePlan.id)}>
                Tag löschen
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {(rows ?? []).map((row) => {
              const exercise = exerciseMap.get(row.exerciseId)
              return (
                <div key={row.id} className="flex flex-col gap-2 rounded-lg border border-border p-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <SearchPicker
                        items={pickerItems}
                        value={row.exerciseId}
                        onChange={(id) => db.trainingPlanExercises.update(row.id, { exerciseId: id })}
                        placeholder="Übung suchen..."
                      />
                    </div>
                    <Button variant="ghost" onClick={() => db.trainingPlanExercises.delete(row.id)}>
                      ✕
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={row.sets}
                      onChange={(e) => db.trainingPlanExercises.update(row.id, { sets: Number(e.target.value) })}
                      placeholder="Sätze"
                      className="w-16 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-accent"
                    />
                    <input
                      value={row.reps}
                      onChange={(e) => db.trainingPlanExercises.update(row.id, { reps: e.target.value })}
                      placeholder="Wdh., z.B. 8-12"
                      className="w-24 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-accent"
                    />
                    <div className="flex-1">
                      <DecimalInput
                        value={row.targetWeightKg}
                        onChange={(n) => db.trainingPlanExercises.update(row.id, { targetWeightKg: n })}
                        placeholder="Zielgewicht (kg)"
                      />
                    </div>
                  </div>
                  {exercise?.muscleGroup && <div className="pl-1 text-xs text-muted">{exercise.muscleGroup}</div>}
                </div>
              )
            })}
          </div>

          <Button variant="secondary" onClick={addRow}>
            + Übung hinzufügen
          </Button>
        </Card>
      )}
    </div>
  )
}
