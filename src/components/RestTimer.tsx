import { useEffect, useRef, useState } from 'react'
import { Button, Select } from './ui'

const DURATIONS = [30, 45, 60, 90, 120, 150, 180]

function playBeep(ctx: AudioContext) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = 880
  gain.gain.setValueAtTime(0.3, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + 0.6)
}

/** Pausen-Timer als schmale Zeile im Tageskopf, direkt neben der Trainingsdauer. */
export default function RestTimer() {
  const [duration, setDuration] = useState(90)
  const [endTime, setEndTime] = useState<number | null>(null)
  const [remaining, setRemaining] = useState(0)
  const audioCtxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    if (endTime === null) return
    const tick = () => {
      const left = Math.max(0, Math.ceil((endTime - Date.now()) / 1000))
      setRemaining(left)
      if (left === 0) {
        setEndTime(null)
        if (audioCtxRef.current) playBeep(audioCtxRef.current)
        navigator.vibrate?.([200, 100, 200])
      }
    }
    tick()
    const interval = setInterval(tick, 250)
    return () => clearInterval(interval)
  }, [endTime])

  function start() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    audioCtxRef.current.resume()
    setEndTime(Date.now() + duration * 1000)
  }

  function cancel() {
    setEndTime(null)
    setRemaining(0)
  }

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
          <Button variant="ghost" onClick={cancel} aria-label="Pause abbrechen">
            ✕
          </Button>
        </>
      ) : (
        <>
          <Select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            aria-label="Pausenlänge"
            className="flex-1 py-1.5"
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d}s
              </option>
            ))}
          </Select>
          <Button variant="primary" onClick={start} className="shrink-0 py-1.5">
            Pause
          </Button>
        </>
      )}
    </div>
  )
}
