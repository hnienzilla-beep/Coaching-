import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db } from '../db/db'
import { Card, Select } from './ui'

export default function StrengthChart({ athleteId }: { athleteId: string }) {
  const logs = useLiveQuery(() => db.workoutLogs.where('athleteId').equals(athleteId).toArray(), [athleteId])
  const logIds = (logs ?? []).map((l) => l.id)
  const logExercises = useLiveQuery(
    () => (logIds.length ? db.workoutLogExercises.where('workoutLogId').anyOf(logIds).toArray() : []),
    [logIds.join(',')],
  )
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), [])

  const dateByLogId = new Map((logs ?? []).map((l) => [l.id, l.date]))
  const exerciseMap = new Map((exercises ?? []).map((e) => [e.id, e]))

  const loggedExerciseIds = [...new Set((logExercises ?? []).filter((r) => r.weightKg !== undefined).map((r) => r.exerciseId))]
  const availableExercises = loggedExerciseIds
    .map((id) => exerciseMap.get(id))
    .filter((e): e is NonNullable<typeof e> => !!e)
    .sort((a, b) => a.name.localeCompare(b.name))

  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null)
  const currentExerciseId = selectedExerciseId ?? availableExercises[0]?.id ?? null

  const chartData = (logExercises ?? [])
    .filter((r) => r.exerciseId === currentExerciseId && r.weightKg !== undefined)
    .map((r) => ({ fullDate: dateByLogId.get(r.workoutLogId) ?? '', weight: r.weightKg }))
    .sort((a, b) => a.fullDate.localeCompare(b.fullDate))
    .map((d) => ({ date: d.fullDate.slice(5), weight: d.weight }))

  if (availableExercises.length === 0) {
    return (
      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Kraft-Verlauf</h2>
        <p className="text-sm text-muted">Noch keine Gewichte im Trainingslog erfasst.</p>
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
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} minTickGap={24} />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} width={36} />
            <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', fontSize: 12 }} />
            <Line type="monotone" dataKey="weight" stroke="#a3e635" strokeWidth={2} name="Gewicht (kg)" connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
