import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { db } from '../db/db'
import { upsertDailyEntry, todayIso } from '../db/queries'
import { celebrateOnce, haptic } from '../lib/feedback'
import { useGrowIn } from '../lib/countUp'
import type { Athlete } from '../models/types'
import { waterGoalFor } from '../lib/water'
import { useTakesCreatine } from '../lib/useCreatine'
import { getPrefs, usePrefs } from '../lib/prefs'
import { fromDisplay, toDisplay } from '../lib/units'
import { Card, CountUp, DecimalInput } from './ui'

/** Wassermenge in der eingestellten Einheit: Liter bzw. Unzen - ohne Einheit. */
function volume(ml: number, oz: boolean): string {
  return oz
    ? Math.round(toDisplay(ml, 'volume')).toLocaleString('de-DE')
    : (ml / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
}

/** Beschriftung eines Wasser-Knopfs, z.B. "250 ml" bzw. "8 oz". */
function amountLabel(ml: number): string {
  return getPrefs().volumeUnit === 'oz' ? `${Math.round(toDisplay(ml, 'volume'))} oz` : `${ml} ml`
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
  const creatine = useTakesCreatine(athlete.id)
  const goal = waterGoalFor(athlete, weightKg, creatine)
  const prefs = usePrefs()
  const oz = prefs.volumeUnit === 'oz'
  const unit = oz ? 'oz' : 'l'
  const amounts = [...prefs.waterAmounts].filter((ml) => ml > 0).sort((a, b) => a - b)
  const smallest = amounts[0] ?? 250
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
                value={oz ? Math.round(toDisplay(goal, 'volume')) : goal / 1000}
                autoFocus
                aria-label={oz ? 'Trinkziel in Unzen' : 'Trinkziel in Litern'}
                className="w-16! px-2! py-1! text-xs!"
                onBlur={() => setEditingGoal(false)}
                onChange={(n) => {
                  if (n !== undefined && n > 0)
                    void db.athletes.update(athlete.id, { waterGoalMl: Math.round(oz ? fromDisplay(n, 'volume') : n * 1000) })
                }}
              />
              {unit}
            </label>
          ) : (
            <button type="button" onClick={() => setEditingGoal(true)} className="text-xs text-muted underline-offset-2 hover:underline">
              Ziel {volume(goal, oz)} {unit} <Pencil size={11} className="inline -translate-y-px" />
            </button>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <CountUp value={oz ? toDisplay(waterMl, 'volume') : waterMl / 1000} decimals={oz ? 0 : 2} className="text-2xl font-bold tabular-nums text-fg" />
          <span className="text-sm text-muted">
            {unit} {reached ? '· geschafft' : `· noch ${volume(goal - waterMl, oz)} ${unit}`}
          </span>
        </div>
        {/* Mengen aus den Einstellungen (Dashboard → Wasser-Knöpfe); − nimmt die kleinste zurück. */}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => void add(-smallest)}
            disabled={waterMl <= 0}
            aria-label={`${amountLabel(smallest)} weniger`}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition active:scale-95 disabled:opacity-40"
          >
            −
          </button>
          {amounts.slice(0, 2).map((ml) => (
            <button
              key={ml}
              type="button"
              onClick={() => void add(ml)}
              className="flex-1 rounded-lg bg-sky-500/15 py-1.5 text-sm font-medium text-sky-500 transition active:scale-95"
            >
              + {amountLabel(ml)}
            </button>
          ))}
        </div>
      </div>
    </Card>
  )
}
