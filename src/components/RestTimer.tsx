import { useSyncExternalStore } from 'react'
import {
  REST_DURATIONS,
  cancelRestTimer,
  getRestTimer,
  setRestDuration,
  startRestTimer,
  subscribeRestTimer,
} from '../lib/restTimer'
import { Button, Select } from './ui'

/**
 * Pausen-Timer als schmale Zeile im Tageskopf, direkt neben der Trainingsdauer.
 *
 * Reine Ansicht - der Zustand liegt in `src/lib/restTimer.ts`, damit die Pause einen
 * Seitenwechsel und ein Neuladen überlebt.
 */
export default function RestTimer() {
  const { duration, endTime, remaining, finishedAt } = useSyncExternalStore(subscribeRestTimer, getRestTimer)

  const running = endTime !== null
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')

  return (
    <div className="flex min-w-[9.5rem] flex-1 items-center gap-2 rounded-xl bg-surface-2 px-2 py-1.5">
      {running ? (
        <>
          <span className="text-[11px] uppercase tracking-wide text-muted">Pause</span>
          <span className="flex-1 text-center text-lg font-semibold tabular-nums text-accent">
            {mm}:{ss}
          </span>
          <Button variant="ghost" onClick={cancelRestTimer} aria-label="Pause abbrechen">
            ✕
          </Button>
        </>
      ) : finishedAt !== null ? (
        // Kurzer Hinweis nach dem Ablauf - vor allem für den Fall, dass die Pause im
        // Hintergrund zu Ende ging und das Signal erst beim Zurückkehren kam.
        <>
          <span className="flex-1 text-center text-sm font-medium text-ok">Pause vorbei</span>
          <Button variant="primary" onClick={() => startRestTimer(duration)} className="shrink-0 py-1.5">
            Erneut
          </Button>
        </>
      ) : (
        <>
          <Select
            value={duration}
            onChange={(e) => setRestDuration(Number(e.target.value))}
            aria-label="Pausenlänge"
            className="flex-1 py-1.5"
          >
            {REST_DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d}s
              </option>
            ))}
          </Select>
          <Button variant="primary" onClick={() => startRestTimer(duration)} className="shrink-0 py-1.5">
            Pause
          </Button>
        </>
      )}
    </div>
  )
}
