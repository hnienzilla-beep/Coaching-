import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Droplet, Dumbbell, Plus, Scale, Utensils } from 'lucide-react'
import { db } from '../db/db'
import { todayIso, upsertDailyEntry } from '../db/queries'
import { haptic } from '../lib/feedback'
import type { Athlete } from '../models/types'
import Sheet from './Sheet'
import WeightSheet from './WeightSheet'

const WATER_STEPS = [250, 500, 750]

/**
 * Schwebender „+“-Knopf rechts unten: Essen, Gewicht, Wasser oder Training eintragen - von
 * jedem Reiter aus, ohne erst dorthin zu wechseln.
 */
export default function QuickAddButton({ athlete, bottomOffset }: { athlete: Athlete; bottomOffset: string }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [weightOpen, setWeightOpen] = useState(false)
  const today = todayIso()
  const todayEntry = useLiveQuery(() => db.dailyEntries.where({ athleteId: athlete.id, date: today }).first(), [athlete.id, today])
  const lastWeight = useLiveQuery(
    async () =>
      (await db.dailyEntries.where('athleteId').equals(athlete.id).toArray())
        .filter((e) => e.weightKg !== undefined && e.date <= today)
        .sort((a, b) => b.date.localeCompare(a.date))[0]?.weightKg,
    [athlete.id, today],
  )
  const [waterAdded, setWaterAdded] = useState<number | null>(null)

  function go(path: string) {
    setOpen(false)
    navigate(`/athlete/${athlete.id}/${path}`, { state: { quickAdd: true } })
  }

  async function addWater(ml: number) {
    haptic('tap')
    await upsertDailyEntry({ id: crypto.randomUUID(), athleteId: athlete.id, date: today, waterMl: (todayEntry?.waterMl ?? 0) + ml })
    setWaterAdded(ml)
    window.setTimeout(() => setWaterAdded(null), 1200)
  }

  const action = 'flex flex-col items-center gap-2 rounded-2xl bg-surface-2 px-3 py-4 text-sm font-medium text-fg transition active:scale-95'
  const iconBox = 'grid h-11 w-11 place-items-center rounded-full bg-accent text-accent-fg'

  return (
    <>
      <button
        type="button"
        aria-label="Neuer Eintrag"
        onClick={() => {
          haptic('tap')
          setOpen(true)
        }}
        className="anim-pop absolute right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-fg shadow-xl shadow-black/40 transition active:scale-90"
        style={{ bottom: bottomOffset }}
      >
        <Plus size={28} strokeWidth={2.5} />
      </button>

      <Sheet open={open} title="Eintragen" onClose={() => setOpen(false)}>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={action} onClick={() => go('ernaehrung?view=log&add=1')}>
            <span className={iconBox}>
              <Utensils size={20} />
            </span>
            Essen
          </button>
          <button
            type="button"
            className={action}
            onClick={() => {
              setOpen(false)
              setWeightOpen(true)
            }}
          >
            <span className={iconBox}>
              <Scale size={20} />
            </span>
            Gewicht
          </button>
          <button type="button" className={action} onClick={() => go('training?view=log')}>
            <span className={iconBox}>
              <Dumbbell size={20} />
            </span>
            Training
          </button>
          <div className={`${action} cursor-default active:scale-100`}>
            <span className={iconBox}>
              <Droplet size={20} />
            </span>
            <span>
              Wasser{' '}
              <span className="text-xs text-muted tabular-nums">
                {(((todayEntry?.waterMl ?? 0) as number) / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} l
              </span>
            </span>
            <div className="flex w-full gap-1">
              {WATER_STEPS.map((ml) => (
                <button
                  key={ml}
                  type="button"
                  onClick={() => void addWater(ml)}
                  className={`flex-1 rounded-lg py-1.5 text-xs tabular-nums transition active:scale-95 ${
                    waterAdded === ml ? 'bg-accent text-accent-fg' : 'bg-surface text-fg'
                  }`}
                >
                  +{ml}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Sheet>

      <WeightSheet
        open={weightOpen}
        athleteId={athlete.id}
        date={today}
        initial={todayEntry?.weightKg ?? lastWeight}
        ffmi={athlete.ffmi}
        heightCm={athlete.heightCm}
        onClose={() => setWeightOpen(false)}
      />
    </>
  )
}
