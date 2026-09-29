import { useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { RotateCcw, Timer, X } from 'lucide-react'
import { cancelRestTimer, getRestTimer, startRestTimer, subscribeRestTimer } from '../lib/restTimer'

const SIZE = 22
const STROKE = 3
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R

/**
 * Laufende Pause als schwarze Pille oben in der Mitte (wie die Dynamic Island) - sichtbar, sobald
 * die Timer-Zeile im Trainingslog aus dem Bild gescrollt ist oder man auf einem anderen Reiter
 * ist. Antippen dehnt sie aus und zeigt Neustart/Abbrechen.
 */
export default function FloatingRestTimer() {
  const { endTime, remaining, duration, finishedAt, inlineVisible } = useSyncExternalStore(subscribeRestTimer, getRestTimer)
  const [expanded, setExpanded] = useState(false)
  const running = endTime !== null
  if (inlineVisible || (!running && finishedAt === null)) return null

  const mm = Math.floor(remaining / 60)
  const ss = String(remaining % 60).padStart(2, '0')
  const fraction = running && duration > 0 ? remaining / duration : 0

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.5rem,calc(env(safe-area-inset-top)+0.25rem))] z-40 flex justify-center">
      <div
        role="button"
        tabIndex={0}
        aria-label={running ? `Pause ${mm}:${ss}` : 'Pause vorbei'}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
        className={`island pointer-events-auto flex cursor-pointer items-center overflow-hidden rounded-full bg-black text-white shadow-xl shadow-black/40 ring-1 ring-white/10 ${
          expanded ? 'gap-3 py-2 pr-2 pl-3' : 'gap-2 py-1.5 pr-3 pl-2'
        }`}
      >
        {running ? (
          <>
            <svg width={SIZE} height={SIZE} className="-rotate-90 shrink-0" aria-hidden="true">
              <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={STROKE} />
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
            <span className={`font-semibold tabular-nums ${expanded ? 'text-xl' : 'text-sm'}`}>
              {mm}:{ss}
            </span>
            {expanded && (
              <span className="anim-pop flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    startRestTimer(duration)
                  }}
                  className="grid h-8 w-8 place-items-center rounded-full bg-white/15"
                  aria-label="Pause neu starten"
                >
                  <RotateCcw size={15} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    cancelRestTimer()
                    setExpanded(false)
                  }}
                  className="grid h-8 w-8 place-items-center rounded-full bg-white/15"
                  aria-label="Pause abbrechen"
                >
                  <X size={15} />
                </button>
              </span>
            )}
          </>
        ) : (
          <>
            <Timer size={16} className="shrink-0 text-ok" />
            <span className="text-sm font-medium">Weiter geht’s!</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                cancelRestTimer()
              }}
              className="grid h-6 w-6 place-items-center rounded-full bg-white/15"
              aria-label="Hinweis schließen"
            >
              <X size={13} />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
