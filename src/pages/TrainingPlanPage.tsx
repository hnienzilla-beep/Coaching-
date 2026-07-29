import { useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { db, exportTrainingPlan, importTrainingPlan } from '../db/db'
import { shareOrDownloadFile } from '../lib/share'
import { estimateWorkoutDurationMinutes, nextOrder } from '../lib/calculator'
import type { Athlete, Exercise, TrainingPlanExercise } from '../models/types'
import { Button, Card, DecimalInput } from '../components/ui'
import SearchPicker from '../components/SearchPicker'
import ExportTrainingPlanButton from '../components/ExportTrainingPlanButton'
import { useCoachMode } from '../lib/coachMode'
import { useDragSensors } from '../lib/dragSensors'

type Ctx = { athlete: Athlete }

export default function TrainingPlanPage() {
  const { athlete } = useOutletContext<Ctx>()
  const [coachMode] = useCoachMode()
  const plans = useLiveQuery(() => db.trainingPlans.where('athleteId').equals(athlete.id).sortBy('order'), [athlete.id])
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), [])
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const importInputRef = useRef<HTMLInputElement>(null)

  const currentPlanId = activePlanId ?? plans?.[0]?.id ?? null
  const activePlan = plans?.find((p) => p.id === currentPlanId)

  const rows = useLiveQuery(
    () => (currentPlanId ? db.trainingPlanExercises.where('planId').equals(currentPlanId).sortBy('order') : []),
    [currentPlanId],
  )

  const sensors = useDragSensors()

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !rows) return
    const oldIndex = rows.findIndex((r) => r.id === active.id)
    const newIndex = rows.findIndex((r) => r.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(rows, oldIndex, newIndex)
    await db.transaction('rw', db.trainingPlanExercises, async () => {
      for (let i = 0; i < reordered.length; i++) {
        await db.trainingPlanExercises.update(reordered[i].id, { order: i })
      }
    })
  }

  const exerciseMap = new Map((exercises ?? []).map((e) => [e.id, e]))
  const pickerItems = (exercises ?? []).map((e) => ({ id: e.id, label: e.name, sublabel: e.muscleGroup, favorite: e.favorite }))

  async function addPhase() {
    const order = nextOrder(plans ?? [])
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
      order: nextOrder(rows ?? []),
      sets: 3,
      reps: '8-12',
    }
    await db.trainingPlanExercises.add(row)
  }

  async function handleExportPlan() {
    if (!activePlan) return
    const json = await exportTrainingPlan(activePlan.id)
    const file = new File([json], `Trainingsplan-Vorlage-${activePlan.phaseName}.json`, { type: 'application/json' })
    await shareOrDownloadFile(file)
  }

  async function handleImportPlan(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const newPlanId = await importTrainingPlan(text, athlete.id)
      setActivePlanId(newPlanId)
    } catch {
      alert('Import fehlgeschlagen. Ist die Datei eine gültige Trainingsplan-Vorlage?')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {plans?.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePlanId(p.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
              p.id === currentPlanId ? 'bg-accent text-accent-fg font-medium' : 'bg-surface-2 text-muted'
            }`}
          >
            {p.phaseName}
          </button>
        ))}
        {coachMode && (
          <button onClick={addPhase} className="shrink-0 rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted">
            + Tag
          </button>
        )}
      </div>

      {activePlan && mode === 'view' && (
        <TrainingPlanOverview
          phaseName={activePlan.phaseName}
          rows={rows ?? []}
          exerciseMap={exerciseMap}
          onEdit={coachMode ? () => setMode('edit') : undefined}
        />
      )}

      {activePlan && mode === 'edit' && coachMode && (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input
              value={activePlan.phaseName}
              onChange={(e) => renamePhase(activePlan.id, e.target.value)}
              className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm font-semibold text-fg outline-none focus:border-accent"
            />
            {plans && plans.length > 1 && (
              <Button variant="danger" onClick={() => deletePhase(activePlan.id)}>
                Tag löschen
              </Button>
            )}
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={(rows ?? []).map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {(rows ?? []).map((row) => (
                  <SortableRow key={row.id} row={row} exercise={exerciseMap.get(row.exerciseId)} pickerItems={pickerItems} />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <Button variant="secondary" onClick={addRow}>
            + Übung hinzufügen
          </Button>

          <Button variant="primary" onClick={() => setMode('view')}>
            Fertig
          </Button>
        </Card>
      )}

      {activePlan && coachMode && (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleExportPlan} className="flex-1">
            Plan exportieren
          </Button>
          <Button variant="secondary" onClick={() => importInputRef.current?.click()} className="flex-1">
            Plan importieren
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              void handleImportPlan(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      )}

      <ExportTrainingPlanButton athlete={athlete} />
    </div>
  )
}

function SortableRow({
  row,
  exercise,
  pickerItems,
}: {
  row: TrainingPlanExercise
  exercise?: Exercise
  pickerItems: { id: string; label: string; sublabel?: string }[]
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex flex-col gap-2 rounded-lg border border-border p-2"
    >
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="shrink-0 touch-none px-1 text-lg text-muted"
          aria-label="Verschieben"
        >
          ⠿
        </button>
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
          className="w-16 min-w-0 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm text-fg outline-none focus:border-accent"
        />
        <input
          value={row.reps}
          onChange={(e) => db.trainingPlanExercises.update(row.id, { reps: e.target.value })}
          placeholder="Wdh., z.B. 8-12"
          className="w-24 min-w-0 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm text-fg outline-none focus:border-accent"
        />
        <div className="flex-1">
          <DecimalInput
            value={row.targetWeightKg}
            onChange={(n) => db.trainingPlanExercises.update(row.id, { targetWeightKg: n })}
            placeholder="Zielgewicht (kg)"
          />
        </div>
      </div>
      <div className="flex items-center gap-2 pl-1">
        {exercise?.imageDataUrl && (
          <img src={exercise.imageDataUrl} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
        )}
        {exercise?.muscleGroup && <div className="text-xs text-muted">{exercise.muscleGroup}</div>}
      </div>
    </div>
  )
}

function TrainingPlanOverview({
  phaseName,
  rows,
  exerciseMap,
  onEdit,
}: {
  phaseName: string
  rows: TrainingPlanExercise[]
  exerciseMap: Map<string, Exercise>
  onEdit?: () => void
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{phaseName}</h2>
        {onEdit && (
          <Button variant="secondary" onClick={onEdit}>
            Bearbeiten
          </Button>
        )}
      </div>

      {rows.length > 0 && (
        <p className="text-xs text-muted">Geschätzte Dauer: ~{estimateWorkoutDurationMinutes(rows)} Min.</p>
      )}

      {rows.length === 0 && <p className="text-sm text-muted">🏋️ Noch keine Übungen an diesem Tag.</p>}

      <div className="flex flex-col gap-1">
        {rows.map((row) => {
          const exercise = exerciseMap.get(row.exerciseId)
          return (
            <div key={row.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <div className="flex items-center gap-3">
                {exercise?.imageDataUrl && (
                  <img src={exercise.imageDataUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                )}
                <div>
                  <div className="text-fg">{exercise?.name ?? '–'}</div>
                  {exercise?.muscleGroup && <div className="text-xs text-muted">{exercise.muscleGroup}</div>}
                </div>
              </div>
              <span className="text-muted">
                {row.sets} x {row.reps}
                {row.targetWeightKg !== undefined ? ` @ ${row.targetWeightKg} kg` : ''}
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
