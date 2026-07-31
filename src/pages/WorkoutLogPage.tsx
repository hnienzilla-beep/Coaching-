import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { getLastExercisePerformance, getOrCreateWorkoutLog, isoDate } from '../db/queries'
import type { Athlete, TrainingPlanExercise, WorkoutSet } from '../models/types'
import { Button, Card, DecimalInput, Field, Input, Select, StatBadge } from '../components/ui'
import CollapsibleCard from '../components/CollapsibleCard'
import SearchPicker, { type SearchPickerItem } from '../components/SearchPicker'
import RestTimer from '../components/RestTimer'
import StrengthChart from '../components/StrengthChart'
import WorkoutTimer from '../components/WorkoutTimer'
import LogDayHeader, { type LogDayStatus } from '../components/LogDayHeader'
import LogHistoryList from '../components/LogHistoryList'
import type { DayMarker } from '../components/DayStrip'
import { formatDuration, nextOrder } from '../lib/calculator'
import { triggerAutoSync } from '../features/obsidianSync/autoSync'

type Ctx = { athlete: Athlete }

function durationSeconds(startedAt?: string, completedAt?: string): number | undefined {
  if (!startedAt || !completedAt) return undefined
  return Math.max(0, Math.floor((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000))
}

async function createSetsFromPlanExercise(
  logExerciseId: string,
  pe: TrainingPlanExercise,
  lastSets: WorkoutSet[] | undefined,
): Promise<void> {
  const repsNum = Number.parseInt(pe.reps, 10)
  const planReps = Number.isFinite(repsNum) ? repsNum : undefined
  const setsToCreate = Math.max(1, pe.sets)
  for (let i = 0; i < setsToCreate; i++) {
    const lastSet = lastSets?.[i]
    await db.workoutSets.add({
      id: crypto.randomUUID(),
      workoutLogExerciseId: logExerciseId,
      setNumber: i + 1,
      reps: lastSet?.reps ?? planReps,
      weightKg: lastSet?.weightKg ?? pe.targetWeightKg,
    })
  }
}

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

  const planExercises = useLiveQuery(
    () =>
      currentLog?.trainingPlanId
        ? db.trainingPlanExercises.where('planId').equals(currentLog.trainingPlanId).sortBy('order')
        : [],
    [currentLog?.trainingPlanId],
  )

  // Alle Sätze des Tages in einem Rutsch - Grundlage für die Fortschrittszeile über der Liste.
  const rowIds = (rows ?? []).map((r) => r.id)
  const daySets = useLiveQuery(
    () => (rowIds.length ? db.workoutSets.where('workoutLogExerciseId').anyOf(rowIds).toArray() : []),
    [rowIds.join(',')],
  )

  const exerciseMap = new Map((exercises ?? []).map((e) => [e.id, e]))
  const pickerItems: SearchPickerItem[] = (exercises ?? []).map((e) => ({
    id: e.id,
    label: e.name,
    sublabel: e.muscleGroup,
    favorite: e.favorite,
  }))
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
    return (a.order ?? 0) - (b.order ?? 0)
  })

  const setsTotal = daySets?.length ?? 0
  const setsDone = (daySets ?? []).filter((s) => s.done).length
  const volumeKg = (daySets ?? []).reduce((sum, s) => sum + (s.reps !== undefined && s.weightKg !== undefined ? s.reps * s.weightKg : 0), 0)
  const elapsed = durationSeconds(currentLog?.startedAt, currentLog?.completedAt)

  const markers = new Map<string, DayMarker>((logs ?? []).map((l) => [l.date, l.completedAt ? 'done' : 'open']))
  const status: LogDayStatus = !currentLog ? 'none' : currentLog.completedAt ? 'done' : 'open'

  async function addExerciseRow() {
    const log = await getOrCreateWorkoutLog(athlete.id, selectedDate)
    const existing = await db.workoutLogExercises.where('workoutLogId').equals(log.id).toArray()
    // Leere exerciseId: die Zeile startet im Auswahlmodus, statt still die erste Übung des
    // Alphabets zu setzen, die dann jemand übersieht.
    await db.workoutLogExercises.add({
      id: crypto.randomUUID(),
      workoutLogId: log.id,
      exerciseId: '',
      order: nextOrder(existing),
    })
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
    const existingRows = await db.workoutLogExercises.where('workoutLogId').equals(log.id).toArray()
    const loggedExerciseIds = new Set(existingRows.map((r) => r.exerciseId))
    const newPlanRows = planRows.filter((pe) => !loggedExerciseIds.has(pe.exerciseId))
    const lastPerformances = await Promise.all(
      newPlanRows.map((pe) => getLastExercisePerformance(athlete.id, pe.exerciseId, selectedDate)),
    )

    await db.transaction('rw', db.workoutLogExercises, db.workoutSets, async () => {
      let order = nextOrder(existingRows)
      for (let i = 0; i < newPlanRows.length; i++) {
        const pe = newPlanRows[i]
        const logExerciseId = crypto.randomUUID()
        await db.workoutLogExercises.add({ id: logExerciseId, workoutLogId: log.id, exerciseId: pe.exerciseId, order: order++ })
        await createSetsFromPlanExercise(logExerciseId, pe, lastPerformances[i]?.sets)
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
    triggerAutoSync()
  }

  async function reopenWorkout() {
    if (!currentLog) return
    await db.workoutLogs.update(currentLog.id, { completedAt: undefined })
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
      <LogDayHeader
        title="Trainingseinheit"
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        markers={markers}
        status={status}
        onDelete={currentLog ? deleteLog : undefined}
        deleteConfirmText="Trainingseinheit dieses Tages mit allen Sätzen löschen?"
      >
        <div className="flex flex-wrap items-center gap-2">
          <WorkoutTimer
            athleteId={athlete.id}
            date={selectedDate}
            startedAt={currentLog?.startedAt}
            completedAt={currentLog?.completedAt}
          />
          {currentLog && <RestTimer />}
        </div>
      </LogDayHeader>

      {currentLog && setsTotal > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <StatBadge label="Sätze" value={`${setsDone} / ${setsTotal}`} tone={setsDone === setsTotal ? 'ok' : 'default'} />
          <StatBadge label="Volumen" value={`${Math.round(volumeKg).toLocaleString('de-DE')} kg`} />
          {/* Die laufende Dauer steht schon im Tageskopf - hier zählt, wie viel Programm
              noch vor einem liegt. */}
          <StatBadge label="Übungen" value={`${sortedRows.length}`} />
        </div>
      )}

      <Card className="flex flex-col gap-3">
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

        {sortedRows.length === 0 && (
          <p className="text-sm text-muted">
            🏋️ Noch keine Übungen für diesen Tag. Wähle oben einen Trainingstag – dann werden die geplanten Übungen samt
            letzter Gewichte übernommen – oder füge eine einzelne Übung hinzu.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {sortedRows.map((row) => (
            <WorkoutExerciseRow
              key={row.id}
              rowId={row.id}
              exerciseId={row.exerciseId}
              exerciseName={exerciseMap.get(row.exerciseId)?.name}
              notes={row.notes}
              pickerItems={pickerItems}
              muscleGroup={exerciseMap.get(row.exerciseId)?.muscleGroup}
              imageDataUrl={exerciseMap.get(row.exerciseId)?.imageDataUrl}
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

        <Field label="Notizen zum Training">
          <textarea
            value={currentLog?.notes ?? ''}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Wie lief die Einheit?"
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          />
        </Field>

        {currentLog?.completedAt ? (
          <div className="flex flex-col items-center gap-1">
            <p className="text-center text-sm text-ok">
              ✓ Abgeschlossen am {new Date(currentLog.completedAt).toLocaleString('de-DE')}
              {elapsed !== undefined ? ` · Dauer: ${formatDuration(elapsed)}` : ''}
            </p>
            <Button variant="ghost" onClick={reopenWorkout}>
              Wieder öffnen
            </Button>
          </div>
        ) : (
          <Button variant="primary" onClick={completeWorkout} disabled={!currentLog}>
            Training beenden
          </Button>
        )}
      </Card>

      <LogHistoryList
        entries={(logs ?? []).map((log) => {
          const seconds = durationSeconds(log.startedAt, log.completedAt)
          return {
            date: log.date,
            done: !!log.completedAt,
            summary: [log.trainingPlanId ? planMap.get(log.trainingPlanId)?.phaseName : undefined, seconds !== undefined ? formatDuration(seconds) : undefined]
              .filter(Boolean)
              .join(' · '),
          }
        })}
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        emptyText="🏋️ Noch keine Trainingseinheiten aufgezeichnet."
      />

      <CollapsibleCard title="Kraft-Verlauf" defaultExpanded={false}>
        <StrengthChart athleteId={athlete.id} />
      </CollapsibleCard>
    </div>
  )
}

function WorkoutExerciseRow({
  rowId,
  exerciseId,
  exerciseName,
  notes,
  pickerItems,
  muscleGroup,
  imageDataUrl,
  planExercise,
  athleteId,
  date,
  onDelete,
}: {
  rowId: string
  exerciseId: string
  exerciseName?: string
  notes?: string
  pickerItems: SearchPickerItem[]
  muscleGroup?: string
  imageDataUrl?: string
  planExercise?: TrainingPlanExercise
  athleteId: string
  date: string
  onDelete: () => void
}) {
  const sets = useLiveQuery(() => db.workoutSets.where('workoutLogExerciseId').equals(rowId).sortBy('setNumber'), [rowId]) ?? []
  const lastPerformance = useLiveQuery(
    () => (exerciseId ? getLastExercisePerformance(athleteId, exerciseId, date) : undefined),
    [athleteId, exerciseId, date],
  )

  // Neue Zeilen haben noch keine Übung - sie öffnen direkt die Suche. Bei allen anderen
  // bleibt die Suche eingeklappt, weil die Übung praktisch nie mehr gewechselt wird.
  const [picking, setPicking] = useState(exerciseId === '')
  const [expanded, setExpanded] = useState(true)
  const [notesOpen, setNotesOpen] = useState(!!notes)

  const doneCount = sets.filter((s) => s.done).length
  const allDone = sets.length > 0 && doneCount === sets.length

  async function addSet() {
    const last = sets[sets.length - 1]
    const lastPerformanceSet = lastPerformance?.sets[sets.length]
    let reps: number | undefined
    let weightKg: number | undefined
    let rpe: number | undefined
    if (last) {
      reps = last.reps
      weightKg = last.weightKg
      rpe = last.rpe
    } else if (lastPerformanceSet) {
      reps = lastPerformanceSet.reps
      weightKg = lastPerformanceSet.weightKg
    } else if (planExercise) {
      const repsNum = Number.parseInt(planExercise.reps, 10)
      reps = Number.isFinite(repsNum) ? repsNum : undefined
      weightKg = planExercise.targetWeightKg
    }
    const set: WorkoutSet = { id: crypto.randomUUID(), workoutLogExerciseId: rowId, setNumber: sets.length + 1, reps, weightKg, rpe }
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
    <div className={`flex flex-col gap-2 rounded-xl border p-2 ${allDone ? 'border-ok/40' : 'border-border'}`}>
      <div className="flex items-center gap-2">
        {imageDataUrl && <img src={imageDataUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-fg">{exerciseName ?? 'Übung wählen …'}</span>
            <span className="block truncate text-xs text-muted">
              {[muscleGroup, sets.length > 0 ? `${doneCount}/${sets.length} Sätze` : 'Noch keine Sätze'].filter(Boolean).join(' · ')}
            </span>
          </span>
          <span className={`shrink-0 text-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▾</span>
        </button>
      </div>

      {expanded && (
        <>
          {picking && (
            <SearchPicker
              items={pickerItems}
              value={exerciseId || undefined}
              onChange={(id) => {
                void db.workoutLogExercises.update(rowId, { exerciseId: id })
                setPicking(false)
              }}
              placeholder="Übung suchen..."
            />
          )}

          {(planExercise || lastPerformance) && (
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {planExercise && (
                <span className="rounded-full bg-surface-2 px-2 py-1 text-muted">
                  Plan: {planExercise.sets}×{planExercise.reps}
                  {planExercise.targetWeightKg !== undefined ? ` @ ${planExercise.targetWeightKg} kg` : ''}
                </span>
              )}
              {lastPerformance && (
                <span className="rounded-full bg-surface-2 px-2 py-1 text-muted">
                  Letztes Mal ({lastPerformance.date.slice(5)}):{' '}
                  {lastPerformance.sets.map((s) => `${s.reps ?? '–'}×${s.weightKg ?? '–'}`).join(' · ')} kg
                </span>
              )}
            </div>
          )}

          {sets.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {/* Spaltenköpfe: die Platzhalter in den Feldern verschwinden, sobald ein Wert
                  drinsteht - ohne Kopfzeile weiß danach niemand mehr, was welche Zahl ist. */}
              <div className="grid grid-cols-[2rem_1.25rem_1fr_1fr_3rem_1.5rem] items-center gap-1 text-[10px] uppercase tracking-wide text-muted">
                {/* Leere Zellen statt sr-only-Text: absolut positionierte Elemente sind
                    keine Grid-Items und würden die Spalten verschieben. Die Bedeutung der
                    Häkchen- und Löschen-Spalte steht in den aria-labels der Buttons. */}
                <span />
                <span className="text-center">#</span>
                <span>Wdh.</span>
                <span>kg</span>
                <span>RPE</span>
                <span />
              </div>
              {sets.map((set) => (
                <div
                  key={set.id}
                  className={`grid grid-cols-[2rem_1.25rem_1fr_1fr_3rem_1.5rem] items-center gap-1 ${set.done ? 'opacity-60' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => db.workoutSets.update(set.id, { done: !set.done })}
                    aria-label={set.done ? `Satz ${set.setNumber} als offen markieren` : `Satz ${set.setNumber} als erledigt markieren`}
                    className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm ${
                      set.done ? 'border-accent bg-accent text-accent-fg' : 'border-border text-muted'
                    }`}
                  >
                    ✓
                  </button>
                  <span className="text-center text-xs tabular-nums text-muted">{set.setNumber}</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={set.reps ?? ''}
                    onChange={(e) => db.workoutSets.update(set.id, { reps: e.target.value === '' ? undefined : Number(e.target.value) })}
                    aria-label={`Wiederholungen Satz ${set.setNumber}`}
                    placeholder="–"
                  />
                  <DecimalInput
                    value={set.weightKg}
                    onChange={(n) => db.workoutSets.update(set.id, { weightKg: n })}
                    aria-label={`Gewicht in kg, Satz ${set.setNumber}`}
                    placeholder="–"
                  />
                  <DecimalInput
                    value={set.rpe}
                    onChange={(n) => db.workoutSets.update(set.id, { rpe: n })}
                    aria-label={`RPE Satz ${set.setNumber}`}
                    placeholder="–"
                  />
                  <button
                    type="button"
                    onClick={() => deleteSet(set.id)}
                    aria-label={`Satz ${set.setNumber} löschen`}
                    className="py-2 text-sm text-muted hover:text-danger"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <Button variant="ghost" onClick={addSet}>
            + Satz hinzufügen
          </Button>

          {notesOpen && (
            <Input
              value={notes ?? ''}
              onChange={(e) => db.workoutLogExercises.update(rowId, { notes: e.target.value })}
              placeholder="Notiz zur Übung (z.B. Griff, Technik)"
              aria-label="Notiz zur Übung"
            />
          )}

          <div className="flex items-center justify-between gap-2 text-xs">
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
            <Button variant="ghost" onClick={onDelete} aria-label="Übung aus dem Log entfernen">
              🗑
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
