import { useState } from 'react'
import type { DailyEntry, WorkoutLog } from '../models/types'
import { isoDate } from '../db/queries'
import { Button, Card } from './ui'

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
  const todayIso = isoDate(today)

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={prevMonth}>
          ‹
        </Button>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{monthLabel}</h2>
        <Button variant="ghost" onClick={nextMonth}>
          ›
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
        {WEEKDAYS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((iso, i) => {
          if (!iso) return <div key={`empty-${i}`} />
          const isToday = iso === todayIso
          const tracked = trackedDates.has(iso)
          const trained = trainedDates.has(iso)
          const day = Number(iso.slice(8, 10))
          return (
            <div
              key={iso}
              className={`flex flex-col items-center gap-0.5 rounded-lg py-1 text-xs ${
                isToday ? 'bg-surface-2 font-semibold text-fg' : 'text-muted'
              }`}
            >
              <span>{day}</span>
              <span className="flex h-1.5 gap-0.5">
                {tracked && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                {trained && <span className="h-1.5 w-1.5 rounded-full bg-[#f472b6]" />}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Tracking
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#f472b6]" /> Training
        </span>
      </div>
    </Card>
  )
}
