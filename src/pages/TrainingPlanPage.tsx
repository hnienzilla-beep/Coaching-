import { useRef, useState } from 'react'
import { ArrowLeftRight, Dumbbell } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { SortableItem } from '../components/Sortable'
import { HeatmapFigure } from '../components/MuscleHeatmap'
import { primaryMuscle, setRecords, type MuscleSetRecord } from '../lib/muscles'
import { todayIso } from '../db/queries'
import { db, exportTrainingPlan, importTrainingPlan } from '../db/db'
import { savePhaseOrder } from '../db/queries'
import { shareOrDownloadFile } from '../lib/share'
import { estimateWorkoutDurationMinutes, nextOrder } from '../lib/calculator'
import type { Athlete, Exercise, TrainingPlanExercise } from '../models/types'
import { Button, DecimalInput, Field, Input, ListRow, StatBadge } from '../components/ui'
import CollapsibleCard from '../components/CollapsibleCard'
import PlanVolumeCard from '../components/PlanVolumeCard'
import { MUSCLE_ORDER, exerciseShares, planFrequencies } from '../lib/planVolume'
import { usePrefs } from '../lib/prefs'
import ExercisePickerSheet from '../components/ExercisePickerSheet'
import PlanPhaseHeader from '../components/PlanPhaseHeader'
import Sheet from '../components/Sheet'
import ExportTrainingPlanButton from '../components/ExportTrainingPlanButton'
import { useCoachMode, useSimpleMode } from '../lib/detailLevel'
import { useDragSensors, verticalOnly } from '../lib/dragSensors'

type Ctx = { athlete: Athlete }

/** Kurzfassung einer Planzeile: "3 × 8-12 @ 60 kg". */
function prescription(row: TrainingPlanExercise): string {
  return `${row.sets} × ${row.reps}${row.targetWeightKg !== undefined ? ` @ ${row.targetWeightKg} kg` : ''}`
}

export default function TrainingPlanPage() {
  const { athlete } = useOutletContext<Ctx>()
  const coachMode = useCoachMode()
  // Einfach: kein Wochenvolumen und keine Muskel-Details - nur Tage und Übungen.
  const simple = useSimpleMode()
  const prefs = usePrefs()
  const plans = useLiveQuery(() => db.trainingPlans.where('athleteId').equals(athlete.id).sortBy('order'), [athlete.id])
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), [])
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  // Übungsauswahl (neue Zeile oder Tausch) und das Bearbeiten-Sheet einer Zeile.
  const [picker, setPicker] = useState<{ swapRowId?: string; currentId?: string } | null>(null)
  const [editRowId, setEditRowId] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const currentPlanId = activePlanId ?? plans?.[0]?.id ?? null
  const activePlan = plans?.find((p) => p.id === currentPlanId)

  // Zahl der Übungen je Tag für die Phasen-Übersicht - eine Abfrage über alle Tage statt
  // einer je Chip. Leere Zeilen (noch ohne Übung) zählen nicht mit, sonst stünde am Chip
  // eine Zahl, zu der in der Leseansicht nichts zu sehen ist.
  const planIdKey = (plans ?? []).map((p) => p.id).join(',')
  const exerciseCounts = useLiveQuery(async () => {
    const planIds = planIdKey === '' ? [] : planIdKey.split(',')
    const all = await db.trainingPlanExercises.where('planId').anyOf(planIds).toArray()
    const counts = new Map<string, number>()
    for (const row of all) {
      if (row.exerciseId !== '') counts.set(row.planId, (counts.get(row.planId) ?? 0) + 1)
    }
    return counts
  }, [planIdKey])

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

  // Die Übung wird im Sheet gewählt, bevor die Zeile entsteht; danach öffnet sich gleich das
  // Bearbeiten-Sheet für Sätze und Wiederholungen.
  async function addRow(exerciseId: string) {
    if (!currentPlanId) return
    const row: TrainingPlanExercise = {
      id: crypto.randomUUID(),
      planId: currentPlanId,
      exerciseId,
      order: nextOrder(rows ?? []),
      sets: 3,
      reps: '8-12',
    }
    await db.trainingPlanExercises.add(row)
    setEditRowId(row.id)
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
  // Geplante Sätze als "Sätze" für die Heatmap - je Satz ein Eintrag mit Hauptmuskel.
  const planRecords: MuscleSetRecord[] = filledRows.flatMap((row) => {
    const ex = exerciseMap.get(row.exerciseId)
    const muscle = ex ? primaryMuscle(ex) : undefined
    if (!ex || !muscle) return []
    const reps = Number.parseInt(row.reps, 10)
    return Array.from({ length: Math.max(0, row.sets) }, () =>
      setRecords({ date: todayIso(), reps: Number.isFinite(reps) ? reps : undefined, weightKg: row.targetWeightKg, exercise: ex.name }, muscle),
    ).flat()
  })

  // Volumen dieses Tages (ein Durchgang) - Hauptmuskel 1, mitarbeitende Muskeln ½.
  const dayVolume = new Map<string, number>()
  for (const row of filledRows) {
    const ex = exerciseMap.get(row.exerciseId)
    if (!ex) continue
    for (const [m, share] of exerciseShares(ex)) dayVolume.set(m, (dayVolume.get(m) ?? 0) + row.sets * share)
  }
  const dayVolumeText = MUSCLE_ORDER.filter((m) => (dayVolume.get(m) ?? 0) > 0)
    .map((m) => `${m} ${(dayVolume.get(m) ?? 0).toLocaleString('de-DE', { maximumFractionDigits: 1 })}`)
    .join(' · ')
  const autoTimes = activePlan && plans ? (planFrequencies({ ...athlete, schedule: athlete.schedule }, plans.map((p) => ({ ...p, timesPerWeek: undefined }))).get(activePlan.id) ?? 1) : 1
  const times = activePlan?.timesPerWeek ?? autoTimes

  return (
    <div className="flex flex-col gap-4">
      {!simple && <PlanVolumeCard athlete={athlete} />}

      <PlanPhaseHeader
        title="Trainingsplan"
        phases={(plans ?? []).map((p) => ({
          id: p.id,
          phaseName: p.phaseName,
          count: exerciseCounts?.get(p.id) ?? 0,
        }))}
        activePhaseId={currentPlanId}
        onSelect={(id) => {
          setActivePlanId(id)
          setMode('view')
        }}
        onAdd={coachMode ? addPhase : undefined}
        addLabel="+ Tag"
        onRename={activePlan ? (name) => renamePhase(activePlan.id, name) : undefined}
        onDelete={activePlan && plans && plans.length > 1 ? () => deletePhase(activePlan.id) : undefined}
        onReorder={
          coachMode
            ? (ids) => {
                // Ohne gesetztes activePlanId zeigt die Seite die erste Phase - nach dem
                // Verschieben wäre das eine andere, und der gerade bearbeitete Tag wäre weg.
                setActivePlanId(currentPlanId)
                void savePhaseOrder('trainingPlans', ids)
              }
            : undefined
        }
        countLabel={(n) => `${n} ${n === 1 ? 'Übung' : 'Übungen'}`}
        phaseNoun="Tag"
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

      {activePlan && !simple && (
        <div className="flex flex-col gap-1 px-1 text-xs text-muted">
          {dayVolumeText && <p>{dayVolumeText}</p>}
          <div className="flex items-center gap-2">
            <span>× pro Woche</span>
            <div className="flex items-center rounded-lg bg-surface-2">
              <button
                type="button"
                aria-label="Seltener pro Woche"
                disabled={times <= 0}
                onClick={() => void db.trainingPlans.update(activePlan.id, { timesPerWeek: Math.max(0, Math.round((times - 1) * 2) / 2) })}
                className="px-2.5 py-1 text-fg disabled:opacity-30"
              >
                −
              </button>
              <span className="w-8 text-center font-semibold tabular-nums text-fg">{times.toLocaleString('de-DE', { maximumFractionDigits: 1 })}</span>
              <button
                type="button"
                aria-label="Öfter pro Woche"
                disabled={times >= 7}
                onClick={() => void db.trainingPlans.update(activePlan.id, { timesPerWeek: Math.min(7, Math.round((times + 1) * 2) / 2) })}
                className="px-2.5 py-1 text-fg disabled:opacity-30"
              >
                +
              </button>
            </div>
            {activePlan.timesPerWeek !== undefined ? (
              <button type="button" onClick={() => void db.trainingPlans.update(activePlan.id, { timesPerWeek: undefined })} className="text-accent">
                Automatisch
              </button>
            ) : (
              <span>aus deinen Trainingstagen</span>
            )}
          </div>
        </div>
      )}

      {activePlan && (
        <div className="flex flex-col gap-1.5">
          {allRows.length === 0 && (
            <p className="px-1 py-2 text-center text-sm text-muted">
              Noch keine Übungen an diesem Tag.
              {coachMode && !editing ? ' Tippe oben auf „Bearbeiten“, um zu planen.' : ''}
            </p>
          )}

          {editing ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[verticalOnly]} onDragEnd={handleDragEnd}>
              <SortableContext items={allRows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                {allRows.map((row) => (
                  <SortableRow key={row.id} row={row} exercise={exerciseMap.get(row.exerciseId)} onEdit={() => setEditRowId(row.id)} />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            filledRows.map((row) => {
              const exercise = exerciseMap.get(row.exerciseId)
              return (
                <ListRow
                  key={row.id}
                  leading={<ExerciseThumb exercise={exercise} />}
                  title={exercise?.name ?? '–'}
                  subtitle={[exercise?.muscleGroup, row.notes].filter(Boolean).join(' · ')}
                  value={prescription(row)}
                />
              )
            })
          )}

          {editing && (
            <Button variant="secondary" className="mt-1.5 py-3" onClick={() => setPicker({})}>
              + Übung hinzufügen
            </Button>
          )}
        </div>
      )}

      {prefs.showHeatmap && activePlan && filledRows.length > 0 && (
        <CollapsibleCard title="Muskeln dieses Tages" storageKey="heatmap-plan" summary={`${planRecords.length} Sätze`}>
          <HeatmapFigure athlete={athlete} records={planRecords} mode="plan" />
        </CollapsibleCard>
      )}

      <ExercisePickerSheet
        open={picker !== null}
        title={picker?.swapRowId ? 'Übung tauschen' : 'Übung hinzufügen'}
        exercises={exercises ?? []}
        selectedId={picker?.currentId}
        onPick={(id) => {
          if (picker?.swapRowId) void db.trainingPlanExercises.update(picker.swapRowId, { exerciseId: id })
          else void addRow(id)
        }}
        onClose={() => setPicker(null)}
      />

      <PlanRowSheet
        key={editRowId ?? 'closed'}
        row={allRows.find((r) => r.id === editRowId)}
        exercise={exerciseMap.get(allRows.find((r) => r.id === editRowId)?.exerciseId ?? '')}
        onSwap={(row) => setPicker({ swapRowId: row.id, currentId: row.exerciseId })}
        onClose={() => setEditRowId(null)}
      />

      {/* Teilen in jeder Ansicht - ein Plan als Datei geht per AirDrop, Mail oder Messenger raus. */}
      {activePlan && (
        <CollapsibleCard title="Plan teilen & importieren" defaultExpanded={false}>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleExportPlan} className="flex-1">
            Plan teilen
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
        </CollapsibleCard>
      )}

      <ExportTrainingPlanButton athlete={athlete} />
    </div>
  )
}

function ExerciseThumb({ exercise }: { exercise?: Exercise }) {
  return exercise?.imageDataUrl ? (
    <img src={exercise.imageDataUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
  ) : (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg text-muted" aria-hidden="true">
      <Dumbbell size={18} />
    </span>
  )
}

function SortableRow({ row, exercise, onEdit }: { row: TrainingPlanExercise; exercise?: Exercise; onEdit: () => void }) {
  return (
    <SortableItem id={row.id}>
      {(handle) => (
        <ListRow
          handle={handle}
          title={exercise?.name ?? 'Übung wählen …'}
          subtitle={exercise?.muscleGroup}
          value={prescription(row)}
          onClick={onEdit}
          ariaLabel={`${exercise?.name ?? 'Übung'} bearbeiten`}
          onSwipeDelete={() => db.trainingPlanExercises.delete(row.id)}
        />
      )}
    </SortableItem>
  )
}

/** Sätze, Wiederholungen, Zielgewicht und Notiz einer Planzeile - Änderungen gelten sofort. */
function PlanRowSheet({
  row,
  exercise,
  onSwap,
  onClose,
}: {
  row?: TrainingPlanExercise
  exercise?: Exercise
  onSwap: (row: TrainingPlanExercise) => void
  onClose: () => void
}) {
  if (!row) return null

  function update(patch: Partial<TrainingPlanExercise>) {
    if (row) void db.trainingPlanExercises.update(row.id, patch)
  }

  return (
    <Sheet
      open
      title={exercise?.name ?? 'Übung'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button
            variant="danger"
            onClick={async () => {
              await db.trainingPlanExercises.delete(row.id)
              onClose()
            }}
          >
            Entfernen
          </Button>
          <Button variant="primary" className="flex-1" onClick={onClose}>
            Fertig
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <Field label="Sätze">
          <Input
            type="number"
            inputMode="numeric"
            value={row.sets}
            onChange={(e) => update({ sets: Number(e.target.value) })}
          />
        </Field>
        <Field label="Wdh.">
          <Input value={row.reps} onChange={(e) => update({ reps: e.target.value })} placeholder="8-12" />
        </Field>
        <Field label="Ziel kg">
          <DecimalInput value={row.targetWeightKg} onChange={(n) => update({ targetWeightKg: n })} placeholder="–" />
        </Field>
      </div>
      <Field label="Notiz (optional)">
        <Input value={row.notes ?? ''} onChange={(e) => update({ notes: e.target.value })} placeholder="z.B. Griff, Technik" />
      </Field>
      <Button variant="ghost" className="self-start" onClick={() => onSwap(row)}>
        <ArrowLeftRight size={14} className="mr-1 inline" /> Übung tauschen
      </Button>
    </Sheet>
  )
}
