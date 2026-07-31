import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db } from '../db/db'
import type { WorkoutSet } from '../models/types'
import { estimateOneRepMax } from '../lib/calculator'
import { Select } from './ui'

type ChartPoint = { date: string; weight: number; setsLabel: string; oneRm?: number }

function StrengthTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: ChartPoint }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="rounded-md border border-border bg-surface px-2 py-1 text-xs">
      <div className="font-semibold text-fg">{label}</div>
      <div className="text-fg">{point.weight} kg</div>
      {point.setsLabel && <div className="text-muted">{point.setsLabel}</div>}
      {point.oneRm !== undefined && <div className="text-muted">Geschätztes 1RM: {point.oneRm.toFixed(1)} kg</div>}
    </div>
  )
}

export default function StrengthChart({ athleteId }: { athleteId: string }) {
  const logs = useLiveQuery(() => db.workoutLogs.where('athleteId').equals(athleteId).toArray(), [athleteId])
  const logIds = (logs ?? []).map((l) => l.id)
  const logExercises = useLiveQuery(
    () => (logIds.length ? db.workoutLogExercises.where('workoutLogId').anyOf(logIds).toArray() : []),
    [logIds.join(',')],
  )
  const logExerciseIds = (logExercises ?? []).map((r) => r.id)
  const workoutSets = useLiveQuery(
    () => (logExerciseIds.length ? db.workoutSets.where('workoutLogExerciseId').anyOf(logExerciseIds).toArray() : []),
    [logExerciseIds.join(',')],
  )
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), [])

  const dateByLogId = new Map((logs ?? []).map((l) => [l.id, l.date]))
  const exerciseMap = new Map((exercises ?? []).map((e) => [e.id, e]))
  const logExerciseById = new Map((logExercises ?? []).map((r) => [r.id, r]))

  // Bester (schwerster) Satz je Trainings-Einheit und Übung als Verlaufswert - der ganze Satz
  // (nicht nur das Gewicht) wird behalten, damit das 1RM über dieselben Reps/Gewicht-Werte
  // geschätzt werden kann statt Gewicht und Wiederholungen aus unterschiedlichen Sätzen zu mischen.
  const topSetByLogExercise = new Map<string, WorkoutSet>()
  for (const set of workoutSets ?? []) {
    if (set.weightKg === undefined) continue
    const current = topSetByLogExercise.get(set.workoutLogExerciseId)
    if (current === undefined || set.weightKg > (current.weightKg ?? 0)) {
      topSetByLogExercise.set(set.workoutLogExerciseId, set)
    }
  }

  const setsByLogExercise = new Map<string, WorkoutSet[]>()
  for (const set of workoutSets ?? []) {
    const list = setsByLogExercise.get(set.workoutLogExerciseId) ?? []
    list.push(set)
    setsByLogExercise.set(set.workoutLogExerciseId, list)
  }

  const loggedExerciseIds = [
    ...new Set([...topSetByLogExercise.keys()].map((leId) => logExerciseById.get(leId)?.exerciseId).filter((id): id is string => !!id)),
  ]
  const availableExercises = loggedExerciseIds
    .map((id) => exerciseMap.get(id))
    .filter((e): e is NonNullable<typeof e> => !!e)
    .sort((a, b) => a.name.localeCompare(b.name))

  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null)
  const currentExerciseId = selectedExerciseId ?? availableExercises[0]?.id ?? null

  const chartData = [...topSetByLogExercise.entries()]
    .filter(([logExerciseId]) => logExerciseById.get(logExerciseId)?.exerciseId === currentExerciseId)
    .map(([logExerciseId, topSet]) => {
      const sets = [...(setsByLogExercise.get(logExerciseId) ?? [])].sort((a, b) => a.setNumber - b.setNumber)
      const setsLabel = sets.map((s) => `${s.reps ?? '–'}×${s.weightKg ?? '–'} kg`).join(' · ')
      const oneRm = topSet.weightKg !== undefined && topSet.reps ? estimateOneRepMax(topSet.weightKg, topSet.reps) : undefined
      return {
        fullDate: dateByLogId.get(logExerciseById.get(logExerciseId)?.workoutLogId ?? '') ?? '',
        weight: topSet.weightKg ?? 0,
        setsLabel,
        oneRm,
      }
    })
    .sort((a, b) => a.fullDate.localeCompare(b.fullDate))
    .map((d): ChartPoint => ({ date: d.fullDate.slice(5), weight: d.weight, setsLabel: d.setsLabel, oneRm: d.oneRm }))

  // Überschrift und Rahmen liefert die aufrufende CollapsibleCard - sonst stünde
  // "Kraft-Verlauf" zweimal untereinander.
  if (availableExercises.length === 0) {
    return <p className="text-sm text-muted">💪 Noch keine Gewichte im Trainingslog erfasst.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <Select value={currentExerciseId ?? ''} onChange={(e) => setSelectedExerciseId(e.target.value)}>
        {availableExercises.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </Select>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ left: -12, right: 12, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} minTickGap={24} />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} width={44} />
            <Tooltip content={<StrengthTooltip />} />
            <Line type="monotone" dataKey="weight" stroke="var(--color-accent)" strokeWidth={2} name="Gewicht (kg)" connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
