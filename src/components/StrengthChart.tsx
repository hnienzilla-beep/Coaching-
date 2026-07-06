import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db } from '../db/db'
import type { WorkoutSet } from '../models/types'
import { Card, Select } from './ui'

type ChartPoint = { date: string; weight: number; setsLabel: string }

function StrengthTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: ChartPoint }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="rounded-md border border-border bg-surface px-2 py-1 text-xs">
      <div className="font-semibold text-fg">{label}</div>
      <div className="text-fg">{point.weight} kg</div>
      {point.setsLabel && <div className="text-muted">{point.setsLabel}</div>}
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

  // Bestes (schwerstes) Satzgewicht je Trainings-Einheit und Übung als Verlaufswert.
  const topWeightByLogExercise = new Map<string, number>()
  for (const set of workoutSets ?? []) {
    if (set.weightKg === undefined) continue
    const current = topWeightByLogExercise.get(set.workoutLogExerciseId)
    if (current === undefined || set.weightKg > current) {
      topWeightByLogExercise.set(set.workoutLogExerciseId, set.weightKg)
    }
  }

  const setsByLogExercise = new Map<string, WorkoutSet[]>()
  for (const set of workoutSets ?? []) {
    const list = setsByLogExercise.get(set.workoutLogExerciseId) ?? []
    list.push(set)
    setsByLogExercise.set(set.workoutLogExerciseId, list)
  }

  const loggedExerciseIds = [
    ...new Set([...topWeightByLogExercise.keys()].map((leId) => logExerciseById.get(leId)?.exerciseId).filter((id): id is string => !!id)),
  ]
  const availableExercises = loggedExerciseIds
    .map((id) => exerciseMap.get(id))
    .filter((e): e is NonNullable<typeof e> => !!e)
    .sort((a, b) => a.name.localeCompare(b.name))

  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null)
  const currentExerciseId = selectedExerciseId ?? availableExercises[0]?.id ?? null

  const chartData = [...topWeightByLogExercise.entries()]
    .filter(([logExerciseId]) => logExerciseById.get(logExerciseId)?.exerciseId === currentExerciseId)
    .map(([logExerciseId, weight]) => {
      const sets = [...(setsByLogExercise.get(logExerciseId) ?? [])].sort((a, b) => a.setNumber - b.setNumber)
      const setsLabel = sets.map((s) => `${s.reps ?? '–'}×${s.weightKg ?? '–'} kg`).join(' · ')
      return {
        fullDate: dateByLogId.get(logExerciseById.get(logExerciseId)?.workoutLogId ?? '') ?? '',
        weight,
        setsLabel,
      }
    })
    .sort((a, b) => a.fullDate.localeCompare(b.fullDate))
    .map((d): ChartPoint => ({ date: d.fullDate.slice(5), weight: d.weight, setsLabel: d.setsLabel }))

  if (availableExercises.length === 0) {
    return (
      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Kraft-Verlauf</h2>
        <p className="text-sm text-muted">💪 Noch keine Gewichte im Trainingslog erfasst.</p>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Kraft-Verlauf</h2>
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
            <Line type="monotone" dataKey="weight" stroke="#a3e635" strokeWidth={2} name="Gewicht (kg)" connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
