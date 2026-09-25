import { useEffect, useState } from 'react'
import { addDays, todayIso } from '../db/queries'
import type { DayMarker } from './DayStrip'
import Sheet from './Sheet'
import { Button } from './ui'

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

/** "2026-09" → erster Tag des Monats und alle Tage des Rasters (Mo-So, aufgefüllt). */
function monthGrid(month: string): (string | null)[] {
  const first = `${month}-01`
  const offset = (new Date(`${first}T00:00:00`).getDay() + 6) % 7 // Montag = 0
  const cells: (string | null)[] = Array.from({ length: offset }, () => null)
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) cells.push(d)
  return cells
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
}

/**
 * Monatskalender zum Springen zu einem beliebigen Tag - ersetzt das native Datumsfeld, das
 * nicht zeigte, an welchen Tagen etwas eingetragen ist.
 */
export default function MonthCalendarSheet({
  open,
  selectedDate,
  markers,
  allowFuture,
  onSelect,
  onClose,
}: {
  open: boolean
  selectedDate: string
  markers: Map<string, DayMarker>
  allowFuture: boolean
  onSelect: (date: string) => void
  onClose: () => void
}) {
  const today = todayIso()
  const [month, setMonth] = useState(selectedDate.slice(0, 7))

  // Beim Öffnen immer im Monat des gewählten Tages beginnen.
  useEffect(() => {
    if (open) setMonth(selectedDate.slice(0, 7))
  }, [open, selectedDate])

  const nextDisabled = !allowFuture && shiftMonth(month, 1) > today.slice(0, 7)

  function pick(date: string) {
    onSelect(date)
    onClose()
  }

  return (
    <Sheet
      open={open}
      title="Tag wählen"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={() => pick(today)}>
          Heute
        </Button>
      }
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          aria-label="Vorheriger Monat"
          className="rounded-lg px-3 py-1 text-xl text-muted hover:text-fg"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-fg">{monthLabel(month)}</span>
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          disabled={nextDisabled}
          aria-label="Nächster Monat"
          className="rounded-lg px-3 py-1 text-xl text-muted hover:text-fg disabled:opacity-30"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((d) => (
          <span key={d} className="pb-1 text-[11px] uppercase text-muted">
            {d}
          </span>
        ))}
        {monthGrid(month).map((date, i) => {
          if (!date) return <span key={`empty-${i}`} />
          const selected = date === selectedDate
          const future = !allowFuture && date > today
          const marker = markers.get(date)
          return (
            <button
              key={date}
              type="button"
              disabled={future}
              onClick={() => pick(date)}
              aria-pressed={selected}
              aria-label={new Date(`${date}T00:00:00`).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
              className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl text-sm tabular-nums transition active:scale-95 disabled:opacity-25 ${
                selected
                  ? 'bg-accent font-semibold text-accent-fg'
                  : date === today
                    ? 'border border-fg/40 text-fg'
                    : 'text-fg hover:bg-surface-2'
              }`}
            >
              {Number(date.slice(8))}
              <span
                className={`h-1 w-1 rounded-full ${marker === undefined ? 'bg-transparent' : selected ? 'bg-accent-fg' : marker === 'done' ? 'bg-ok' : 'bg-accent-dim'}`}
              />
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
