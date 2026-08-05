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
import { Button, Card, DecimalInput, Input, StatBadge } from '../components/ui'
import SearchPicker, { type SearchPickerItem } from '../components/SearchPicker'
import PlanItemRow from '../components/PlanItemRow'
import PlanPhaseHeader from '../components/PlanPhaseHeader'
import ExportTrainingPlanButton from '../components/ExportTrainingPlanButton'
import { useCoachMode } from '../lib/coachMode'
import { useDragSensors } from '../lib/dragSensors'

type Ctx = { athlete: Athlete }

/** Kurzfassung einer Planzeile: "3 × 8-12 @ 60 kg". */
function prescription(row: TrainingPlanExercise): string {
  return `${row.sets} × ${row.reps}${row.targetWeightKg !== undefined ? ` @ ${row.targetWeightKg} kg` : ''}`
}

export default function TrainingPlanPage() {
  const { athlete } = useOutletContext<Ctx>()
  const [coachMode] = useCoachMode()
  const plans = useLiveQuery(() => db.trainingPlans.where('athleteId').equals(athlete.id).sortBy('order'), [athlete.id])
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), [])
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  // Frisch angelegte Zeilen starten aufgeklappt - dort fehlt die Übung noch.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const importInputRef = useRef<HTMLInputElement>(null)

  const currentPlanId = activePlanId ?? plans?.[0]?.id ?? null
  const activePlan = plans?.find((p) => p.id === currentPlanId)

  const rows = useLiveQuery(
    () => (currentPlanId ? db.trainingPlanExercises.where('planId').equals(currentPlanId).sortBy('order') : []),
    [currentPlanId],
  )

  const sensors = useDragSensors()

  const editing = mode === 'edit' && coachMode
  const allRows = rows ?? []
  // Kennzahlen und Leseansicht zählen nur Zeilen mit Übung - eine gerade angelegte, noch
  // leere Zeile ist kein Trainingsinhalt.
  const filledRows = allRows.filter((r) => r.exerciseId !== '')

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
  const pickerItems: SearchPickerItem[] = (exercises ?? []).map((e) => ({
    id: e.id,
    label: e.name,
    sublabel: e.muscleGroup,
    favorite: e.favorite,
  }))

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
    setMode('view')
  }

  async function renamePhase(planId: string, name: string) {
    await db.trainingPlans.update(planId, { phaseName: name })
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function addRow() {
    if (!currentPlanId) return
    // Leere exerciseId: die Zeile startet mit offener Suche, statt still die erste Übung des
    // Alphabets zu setzen, die dann jemand übersieht - genauso macht es das Trainingslog.
    const row: TrainingPlanExercise = {
      id: crypto.randomUUID(),
      planId: currentPlanId,
      exerciseId: '',
      order: nextOrder(rows ?? []),
      sets: 3,
      reps: '8-12',
    }
    await db.trainingPlanExercises.add(row)
    setExpandedIds((prev) => new Set(prev).add(row.id))
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

  const totalSets = filledRows.reduce((sum, r) => sum + r.sets, 0)

  return (
    <div className="flex flex-col gap-4">
      <PlanPhaseHeader
        title="Trainingsplan"
        phases={plans ?? []}
        activePhaseId={currentPlanId}
        onSelect={(id) => {
          setActivePlanId(id)
          setMode('view')
        }}
        onAdd={coachMode ? addPhase : undefined}
        addLabel="+ Tag"
        onRename={activePlan ? (name) => renamePhase(activePlan.id, name) : undefined}
        onDelete={activePlan && plans && plans.length > 1 ? () => deletePhase(activePlan.id) : undefined}
        deleteConfirmText="Diesen Trainingstag mit allen Übungen löschen?"
        subtitle={
          filledRows.length ? `${filledRows.length} ${filledRows.length === 1 ? 'Übung' : 'Übungen'}` : undefined
        }
        editing={editing}
        actions={
          activePlan && coachMode ? (
            <Button variant={editing ? 'primary' : 'secondary'} onClick={() => setMode(editing ? 'view' : 'edit')}>
              {editing ? 'Fertig' : 'Bearbeiten'}
            </Button>
          ) : undefined
        }
      />

      {activePlan && filledRows.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <StatBadge label="Übungen" value={`${filledRows.length}`} />
          <StatBadge label="Sätze" value={`${totalSets}`} />
          {/* Einheit im Label statt im Wert: "~20 Min." bricht auf schmalen Geräten um. */}
          <StatBadge label="Dauer (Min.)" value={`~${estimateWorkoutDurationMinutes(filledRows)}`} />
        </div>
      )}

      {activePlan && (
        <Card className="flex flex-col gap-3">
          {allRows.length === 0 && (
            <p className="text-sm text-muted">
              🏋️ Noch keine Übungen an diesem Tag.
              {coachMode && !editing ? ' Tippe oben auf „Bearbeiten“, um zu planen.' : ''}
            </p>
          )}

          {editing ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={allRows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-1.5">
                  {allRows.map((row) => (
                    <SortableRow
                      key={row.id}
                      row={row}
                      exercise={exerciseMap.get(row.exerciseId)}
                      pickerItems={pickerItems}
                      expanded={expandedIds.has(row.id)}
                      onToggle={() => toggleExpanded(row.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="flex flex-col gap-1">
              {filledRows.map((row) => {
                const exercise = exerciseMap.get(row.exerciseId)
                return (
                  <div key={row.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      {exercise?.imageDataUrl && (
                        <img src={exercise.imageDataUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-fg">{exercise?.name ?? '–'}</div>
                        {exercise?.muscleGroup && <div className="text-xs text-muted">{exercise.muscleGroup}</div>}
                      </div>
                    </div>
                    <span className="shrink-0 text-muted">{prescription(row)}</span>
                  </div>
                )
              })}
            </div>
          )}

          {editing && (
            <Button variant="secondary" onClick={addRow}>
              + Übung hinzufügen
            </Button>
          )}
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
  expanded,
  onToggle,
}: {
  row: TrainingPlanExercise
  exercise?: Exercise
  pickerItems: SearchPickerItem[]
  expanded: boolean
  onToggle: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id })
  const [picking, setPicking] = useState(row.exerciseId === '')
  const [notesOpen, setNotesOpen] = useState(!!row.notes)

  function update(patch: Partial<TrainingPlanExercise>) {
    void db.trainingPlanExercises.update(row.id, patch)
  }

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}>
      <PlanItemRow
        title={exercise?.name ?? 'Übung wählen …'}
        subtitle={[exercise?.muscleGroup, prescription(row)].filter(Boolean).join(' · ')}
        imageDataUrl={exercise?.imageDataUrl}
        expanded={expanded}
        onToggle={onToggle}
        onDelete={() => db.trainingPlanExercises.delete(row.id)}
        deleteLabel={`${exercise?.name ?? 'Übung'} aus dem Plan entfernen`}
        dragHandle={
          <button
            {...attributes}
            {...listeners}
            type="button"
            className="shrink-0 touch-none px-1 text-lg text-muted"
            aria-label="Verschieben"
          >
            ⠿
          </button>
        }
      >
        {picking && (
          <SearchPicker
            items={pickerItems}
            value={row.exerciseId || undefined}
            onChange={(id) => {
              update({ exerciseId: id })
              setPicking(false)
            }}
            placeholder="Übung suchen..."
          />
        )}

        {/* Spaltenköpfe: die Platzhalter in den Feldern verschwinden, sobald ein Wert
            drinsteht - ohne Kopfzeile weiß danach niemand mehr, was welche Zahl ist. */}
        <div className="grid grid-cols-[3rem_1fr_1fr] gap-1 text-[10px] uppercase tracking-wide text-muted">
          <span>Sätze</span>
          <span>Wdh.</span>
          <span>Ziel kg</span>
        </div>
        <div className="grid grid-cols-[3rem_1fr_1fr] items-center gap-1">
          <Input
            type="number"
            inputMode="numeric"
            value={row.sets}
            onChange={(e) => update({ sets: Number(e.target.value) })}
            aria-label="Anzahl Sätze"
          />
          <Input
            value={row.reps}
            onChange={(e) => update({ reps: e.target.value })}
            placeholder="8-12"
            aria-label="Wiederholungen"
          />
          <DecimalInput
            value={row.targetWeightKg}
            onChange={(n) => update({ targetWeightKg: n })}
            placeholder="–"
            aria-label="Zielgewicht in kg"
          />
        </div>

        {notesOpen && (
          <Input
            value={row.notes ?? ''}
            onChange={(e) => update({ notes: e.target.value })}
            placeholder="Notiz zur Übung (z.B. Griff, Technik)"
            aria-label="Notiz zur Übung"
          />
        )}

        <div className="flex gap-1">
          <Button variant="ghost" onClick={() => setPicking((v) => !v)}>
            ✎ Übung tauschen
          </Button>
          {!notesOpen && (
            <Button variant="ghost" onClick={() => setNotesOpen(true)}>
              + Notiz
            </Button>
          )}
        </div>
      </PlanItemRow>
    </div>
  )
}
