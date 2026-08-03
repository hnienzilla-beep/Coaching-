import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { getOrCreateWorkoutLog } from '../db/queries'
import { formatDuration } from '../lib/calculator'
import { Button } from './ui'

/**
 * Trainingsdauer als schmale Zeile im Tageskopf - vorher eine eigene Karte im
 * eingeklappten "Werkzeuge"-Block, wo der Startknopf praktisch unauffindbar war.
 */
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
    const update = () => setNow(Date.now())
    update()
    const interval = setInterval(update, 1000)
    // Der Takt wird im Hintergrund gedrosselt und kann von iOS ganz verworfen werden - beim
    // Zurückkehren deshalb sofort nachziehen, statt auf den nächsten Tick zu warten. Die
    // Dauer selbst stimmt ohnehin, sie kommt aus dem gespeicherten `startedAt`.
    document.addEventListener('visibilitychange', update)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', update)
    }
  }, [startedAt, completedAt])

  async function start() {
    const log = await getOrCreateWorkoutLog(athleteId, date)
    await db.workoutLogs.update(log.id, { startedAt: new Date().toISOString() })
  }

  if (!startedAt) {
    return (
      <Button variant="primary" onClick={start} className="w-full">
        ▶ Training starten
      </Button>
    )
  }

  const endMs = completedAt ? new Date(completedAt).getTime() : now
  const elapsedSeconds = Math.max(0, Math.floor((endMs - new Date(startedAt).getTime()) / 1000))

  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
      <span className="text-[11px] uppercase tracking-wide text-muted">Dauer</span>
      <span className={`text-lg font-semibold tabular-nums ${completedAt ? 'text-fg' : 'text-accent'}`}>
        {formatDuration(elapsedSeconds)}
      </span>
    </div>
  )
}
