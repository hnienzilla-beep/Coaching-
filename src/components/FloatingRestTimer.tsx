import { useSyncExternalStore } from 'react'
import { cancelRestTimer, getRestTimer, startRestTimer, subscribeRestTimer } from '../lib/restTimer'

const SIZE = 44
const STROKE = 4
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R

/**
 * Laufende Pause als schwebende Pille über der unteren Leiste - sichtbar, sobald die Timer-Zeile
 * im Trainingslog aus dem Bild gescrollt ist oder man auf einem anderen Reiter ist. Der Ring
 * läuft mit der Restzeit leer.
 */
export default function FloatingRestTimer() {
  const { endTime, remaining, duration, finishedAt, inlineVisible } = useSyncExternalStore(subscribeRestTimer, getRestTimer)
  const running = endTime !== null
  if (inlineVisible || (!running && finishedAt === null)) return null

  const mm = Math.floor(remaining / 60)
  const ss = String(remaining % 60).padStart(2, '0')
  const fraction = running && duration > 0 ? remaining / duration : 0

  return (
    <div className="anim-pop pointer-events-none absolute inset-x-0 bottom-full z-30 flex justify-center pb-2">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-surface/90 py-1.5 pr-2 pl-1.5 shadow-xl shadow-black/40 backdrop-blur-xl">
        <svg width={SIZE} height={SIZE} className="-rotate-90" aria-hidden="true">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth={STROKE} />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${C * fraction} ${C}`}
            className="transition-[stroke-dasharray] duration-300 ease-linear"
          />
        </svg>
        {running ? (
          <>
            <span className="min-w-[3.5rem] text-lg font-semibold tabular-nums text-fg">
              {mm}:{ss}
            </span>
            <button
              type="button"
              onClick={() => startRestTimer(duration)}
              className="rounded-full px-2 py-1 text-xs text-muted hover:text-fg"
              aria-label="Pause neu starten"
            >
              ↺
            </button>
            <button
              type="button"
              onClick={cancelRestTimer}
              className="rounded-full px-2 py-1 text-xs text-muted hover:text-fg"
              aria-label="Pause abbrechen"
            >
              ✕
            </button>
          </>
        ) : (
          <>
            <span className="text-sm font-medium text-ok">Pause vorbei – weiter geht’s!</span>
            <button type="button" onClick={cancelRestTimer} className="rounded-full px-2 py-1 text-xs text-muted" aria-label="Hinweis schließen">
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  )
}
