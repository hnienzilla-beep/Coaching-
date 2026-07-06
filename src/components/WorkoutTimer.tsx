import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { getOrCreateWorkoutLog } from '../db/queries'
import { formatDuration } from '../lib/calculator'
import { Button, Card } from './ui'

export default function WorkoutTimer({
  athleteId,
  date,
  startedAt,
  completedAt,
}: {
  athleteId: string
  date: string
  startedAt?: string
  completedAt?: string
}) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!startedAt || completedAt) return
    setNow(Date.now())
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [startedAt, completedAt])

  async function start() {
    const log = await getOrCreateWorkoutLog(athleteId, date)
    await db.workoutLogs.update(log.id, { startedAt: new Date().toISOString() })
  }

  if (!startedAt) {
    return (
      <Card className="flex items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Trainingsdauer</h2>
        <Button variant="primary" onClick={start} className="flex-1">
          Training starten
        </Button>
      </Card>
    )
  }

  const endMs = completedAt ? new Date(completedAt).getTime() : now
  const elapsedSeconds = Math.max(0, Math.floor((endMs - new Date(startedAt).getTime()) / 1000))

  return (
    <Card className="flex items-center gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Trainingsdauer</h2>
      <span className={`flex-1 text-center text-2xl font-bold tabular-nums ${completedAt ? 'text-fg' : 'text-accent'}`}>
        {formatDuration(elapsedSeconds)}
      </span>
    </Card>
  )
}
