import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { db } from '../db/db'
import { upsertDailyEntry, todayIso } from '../db/queries'
import { celebrateOnce, haptic } from '../lib/feedback'
import { useGrowIn } from '../lib/countUp'
import type { Athlete } from '../models/types'
import { waterGoalFor } from '../lib/water'
import { Card, CountUp, DecimalInput } from './ui'

function liters(ml: number): string {
  return (ml / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
}

/**
 * Wasser des Tages: ein Glas, das sich mit jedem Tipp füllt, dazu Knöpfe für 250 und 500 ml.
 * Gespeichert im Tageseintrag (wie Gewicht und Kalorien); das Ziel lässt sich antippen und ändern.
 */
export default function WaterTracker({
  athlete,
  date,
  waterMl,
  weightKg,
}: {
  athlete: Athlete
  date: string
  waterMl: number
  weightKg?: number
}) {
  const goal = waterGoalFor(athlete, weightKg)
  const grown = useGrowIn()
  const [editingGoal, setEditingGoal] = useState(false)
  const fraction = Math.min(1, waterMl / goal)
  const shownFraction = grown ? fraction : 0
  const reached = waterMl >= goal

  useEffect(() => {
    if (reached && date === todayIso()) celebrateOnce(`wasser-${athlete.id}-${date}`)
  }, [reached, date, athlete.id])

  async function add(ml: number) {
    const next = Math.max(0, waterMl + ml)
    haptic('tap')
    await upsertDailyEntry({ id: crypto.randomUUID(), athleteId: athlete.id, date, waterMl: next })
  }

  // Glas als Trapez; das Wasser ist ein Rechteck, das von unten steigt, oben eine Welle.
  const top = 8
  const bottom = 92
  const waterTop = bottom - (bottom - top) * shownFraction

  return (
    <Card className="flex items-center gap-4">
      <svg width="64" height="100" viewBox="0 0 64 100" aria-hidden="true" className="shrink-0">
        <defs>
          <clipPath id="glass">
            <path d="M6 6 L58 6 L52 94 Q51.5 97 48 97 L16 97 Q12.5 97 12 94 Z" />
          </clipPath>
          <linearGradient id="water" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#38bdf8" stopOpacity="0.95" />
            <stop offset="1" stopColor="#0284c7" stopOpacity="0.95" />
          </linearGradient>
        </defs>
        <g clipPath="url(#glass)">
          <rect x="0" y="0" width="64" height="100" fill="var(--color-surface-2)" />
          <g style={{ transform: `translateY(${waterTop}px)`, transition: 'transform 900ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
            <path className="water-wave" d="M-64 4 Q-48 -2 -32 4 T0 4 T32 4 T64 4 T96 4 V110 H-64 Z" fill="url(#water)" />
          </g>
        </g>
        <path
          d="M6 6 L58 6 L52 94 Q51.5 97 48 97 L16 97 Q12.5 97 12 94 Z"
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="2"
        />
      </svg>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-muted">Wasser</span>
          {editingGoal ? (
            <label className="flex items-center gap-1 text-xs text-muted">
              Ziel
              <DecimalInput
                value={goal / 1000}
                autoFocus
                aria-label="Trinkziel in Litern"
                className="w-16! px-2! py-1! text-xs!"
                onBlur={() => setEditingGoal(false)}
                onChange={(n) => {
                  if (n !== undefined && n > 0) void db.athletes.update(athlete.id, { waterGoalMl: Math.round(n * 1000) })
                }}
              />
              l
            </label>
          ) : (
            <button type="button" onClick={() => setEditingGoal(true)} className="text-xs text-muted underline-offset-2 hover:underline">
              Ziel {liters(goal)} l <Pencil size={11} className="inline -translate-y-px" />
            </button>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <CountUp value={waterMl / 1000} decimals={2} className="text-2xl font-bold tabular-nums text-fg" />
          <span className="text-sm text-muted">l {reached ? '· geschafft' : `· noch ${liters(goal - waterMl)} l`}</span>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => void add(-250)}
            disabled={waterMl <= 0}
            aria-label="250 ml weniger"
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition active:scale-95 disabled:opacity-40"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => void add(250)}
            className="flex-1 rounded-lg bg-sky-500/15 py-1.5 text-sm font-medium text-sky-500 transition active:scale-95"
          >
            + 250 ml
          </button>
          <button
            type="button"
            onClick={() => void add(500)}
            className="flex-1 rounded-lg bg-sky-500/15 py-1.5 text-sm font-medium text-sky-500 transition active:scale-95"
          >
            + 500 ml
          </button>
        </div>
      </div>
    </Card>
  )
}
