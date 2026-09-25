import { useState } from 'react'
import type { DailyEntry, WorkoutLog } from '../models/types'
import { isoDate, todayIso } from '../db/queries'
import { Card } from './ui'

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export default function CalendarOverview({ entries, workoutLogs }: { entries: DailyEntry[]; workoutLogs: WorkoutLog[] }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const trackedDates = new Set(
    entries.filter((e) => e.weightKg !== undefined || e.bodyFatPct !== undefined || e.calories !== undefined).map((e) => e.date),
  )
  const trainedDates = new Set(workoutLogs.map((w) => w.date))

  const firstOfMonth = new Date(Date.UTC(year, month, 1))
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const firstWeekday = (firstOfMonth.getUTCDay() + 6) % 7 // 0 = Montag

  const cells: (string | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(isoDate(new Date(Date.UTC(year, month, d))))

  function prevMonth() {
    if (month === 0) {
      setYear((y) => y - 1)
      setMonth(11)
    } else {
      setMonth((m) => m - 1)
    }
  }

  function nextMonth() {
    if (month === 11) {
      setYear((y) => y + 1)
      setMonth(0)
    } else {
      setMonth((m) => m + 1)
    }
  }

  const monthLabel = firstOfMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const todayDate = todayIso()

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={prevMonth} aria-label="Vorheriger Monat" className="rounded-lg px-3 py-1 text-xl text-muted hover:text-fg">
          ‹
        </button>
        <h2 className="text-sm font-semibold text-fg">{monthLabel}</h2>
        <button type="button" onClick={nextMonth} aria-label="Nächster Monat" className="rounded-lg px-3 py-1 text-xl text-muted hover:text-fg">
          ›
        </button>
      </div>

      {/* Neu gemountet je Monat, damit der Wechsel sichtbar einblendet. */}
      <div key={`${year}-${month}`} className="anim-page grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="pb-1 text-[11px] uppercase text-muted">
            {w}
          </span>
        ))}
        {cells.map((iso, i) => {
          if (!iso) return <span key={`empty-${i}`} />
          const isToday = iso === todayDate
          const tracked = trackedDates.has(iso)
          const trained = trainedDates.has(iso)
          const future = iso > todayDate
          return (
            <div
              key={iso}
              className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl text-sm tabular-nums ${
                isToday ? 'bg-accent font-semibold text-accent-fg' : future ? 'text-muted/50' : 'text-fg'
              }`}
            >
              {Number(iso.slice(8, 10))}
              <span className="flex h-1.5 gap-0.5">
                {tracked && <span className={`h-1.5 w-1.5 rounded-full ${isToday ? 'bg-accent-fg' : 'bg-ok'}`} />}
                {trained && <span className="h-1.5 w-1.5 rounded-full bg-[#f472b6]" />}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex justify-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Tracking
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#f472b6]" /> Training
        </span>
      </div>
    </Card>
  )
}
