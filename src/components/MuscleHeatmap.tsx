import { useEffect, useRef, useState } from 'react'
import { db } from '../db/db'
import { todayIso } from '../db/queries'
import { useGrowIn } from '../lib/countUp'
import { haptic } from '../lib/feedback'
import { MUSCLES, muscleHeat, targetFor, type Muscle, type MuscleSetRecord } from '../lib/muscles'
import type { Athlete } from '../models/types'
import BodyFigure, { type HeatMap, type Side } from './BodyFigure'
import Sheet from './Sheet'
import { DecimalInput, Field } from './ui'

function heatFrom(records: MuscleSetRecord[], athlete: Athlete): HeatMap {
  const counts = new Map<Muscle, number>()
  for (const r of records) counts.set(r.muscle, (counts.get(r.muscle) ?? 0) + 1)
  return Object.fromEntries(MUSCLES.map((m) => [m, muscleHeat(counts.get(m) ?? 0, targetFor(m, athlete.muscleTargets))])) as HeatMap
}

/**
 * Eine große Figur, die sich per Tippen auf "Vorne/Hinten" oder Wischen umdreht. Muskeln sind
 * antippbar (Detailfenster). `records` sind entweder die echten Sätze der letzten 7 Tage
 * (Trainingslog) oder die geplanten Sätze eines Trainingstags (Trainingsplan).
 */
export function HeatmapFigure({
  athlete,
  records,
  mode,
}: {
  athlete: Athlete
  records: MuscleSetRecord[]
  mode: 'log' | 'plan'
}) {
  const [side, setSide] = useState<Side>('front')
  const [selected, setSelected] = useState<Muscle | null>(null)
  const grown = useGrowIn()
  const sex = athlete.gender === 'Weiblich' ? 'female' : 'male'
  const heat = heatFrom(records, athlete)
  const figureRef = useRef<HTMLDivElement>(null)

  // Waagerecht über die Figur wischen dreht sie um (data-no-swipe: kein Reiterwechsel).
  useEffect(() => {
    const el = figureRef.current
    if (!el) return
    let startX: number | null = null
    const onStart = (e: TouchEvent) => {
      startX = e.touches[0]?.clientX ?? null
    }
    const onEnd = (e: TouchEvent) => {
      if (startX === null) return
      const dx = e.changedTouches[0].clientX - startX
      startX = null
      if (Math.abs(dx) > 40) {
        haptic('tap')
        setSide((s) => (s === 'front' ? 'back' : 'front'))
      }
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchend', onEnd)
    }
  }, [])

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex rounded-full bg-surface-2 p-0.5 text-xs">
        {(['front', 'back'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            aria-pressed={side === s}
            className={`rounded-full px-3 py-1 transition-colors ${side === s ? 'bg-accent text-accent-fg' : 'text-muted'}`}
          >
            {s === 'front' ? 'Vorne' : 'Hinten'}
          </button>
        ))}
      </div>
      <div ref={figureRef} data-no-swipe className="touch-pan-y">
        <div key={side} className="anim-pop">
          <BodyFigure side={side} sex={sex} heat={heat} grown={grown} selected={selected} onSelect={setSelected} className="h-96 w-auto" />
        </div>
      </div>
      <p className="text-[11px] text-muted">Muskel antippen für Details · wischen zum Umdrehen</p>
      <MuscleDetailSheet athlete={athlete} muscle={selected} records={records} mode={mode} onClose={() => setSelected(null)} />
    </div>
  )
}

function daysAgoLabel(date: string): string {
  const days = Math.round((Date.parse(`${todayIso()}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000)
  if (days <= 0) return 'heute'
  if (days === 1) return 'gestern'
  return `vor ${days} Tagen`
}

function MuscleDetailSheet({
  athlete,
  muscle,
  records,
  mode,
  onClose,
}: {
  athlete: Athlete
  muscle: Muscle | null
  records: MuscleSetRecord[]
  mode: 'log' | 'plan'
  onClose: () => void
}) {
  if (!muscle) return null
  const mine = records.filter((r) => r.muscle === muscle)
  const target = targetFor(muscle, athlete.muscleTargets)
  const volume = Math.round(mine.reduce((a, r) => a + (r.reps ?? 0) * (r.weightKg ?? 0), 0))
  const byExercise = new Map<string, number>()
  for (const r of mine) byExercise.set(r.exercise, (byExercise.get(r.exercise) ?? 0) + 1)
  const last = mine.reduce<string | undefined>((max, r) => (!max || r.date > max ? r.date : max), undefined)
  const pct = Math.min(100, (mine.length / target) * 100)

  return (
    <Sheet open title={muscle} onClose={onClose}>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold tabular-nums text-fg">{mine.length}</span>
        <span className="text-sm text-muted">
          / {target} Sätze {mode === 'log' ? 'in 7 Tagen' : 'geplant'}
        </span>
        {mine.length > target && <span className="ml-auto text-sm">✨ über dem Richtwert</span>}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-surface-2 px-3 py-2">
          <p className="text-[11px] text-muted">Volumen</p>
          <p className="font-semibold tabular-nums text-fg">{volume.toLocaleString('de-DE')} kg</p>
        </div>
        {mode === 'log' && (
          <div className="rounded-xl bg-surface-2 px-3 py-2">
            <p className="text-[11px] text-muted">Zuletzt trainiert</p>
            <p className="font-semibold text-fg">{last ? daysAgoLabel(last) : '–'}</p>
          </div>
        )}
      </div>
      {byExercise.size > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Übungen</p>
          {[...byExercise.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name, n]) => (
              <div key={name} className="flex justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
                <span className="text-fg">{name}</span>
                <span className="tabular-nums text-muted">{n} Sätze</span>
              </div>
            ))}
        </div>
      ) : (
        <p className="text-sm text-muted">{mode === 'log' ? 'In den letzten 7 Tagen nicht trainiert.' : 'In diesem Trainingstag nicht enthalten.'}</p>
      )}
      <Field label="Wochen-Richtwert (Sätze)">
        <DecimalInput
          value={target}
          onChange={(n) => {
            if (n === undefined || n <= 0) return
            void db.athletes.update(athlete.id, { muscleTargets: { ...athlete.muscleTargets, [muscle]: Math.round(n) } })
          }}
        />
      </Field>
      <p className="text-[11px] text-muted">Ab dem Richtwert ist der Muskel voll gefärbt, darüber glüht er.</p>
    </Sheet>
  )
}

/** Heatmap im Trainingslog: echte Sätze der letzten 7 Tage plus "Heute dran". */
export default function MuscleHeatmap({ athlete, records, focus }: { athlete: Athlete; records: MuscleSetRecord[]; focus: Muscle[] }) {
  return (
    <div className="flex flex-col gap-3">
      {focus.length > 0 && <FocusHint focus={focus} />}
      <HeatmapFigure athlete={athlete} records={records} mode="log" />
    </div>
  )
}

export function FocusHint({ focus }: { focus: Muscle[] }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-accent/10 px-3 py-2 text-sm">
      <span aria-hidden="true">🎯</span>
      <span className="text-fg">
        Heute dran: <span className="font-semibold">{focus.join(' · ')}</span>
      </span>
    </div>
  )
}
