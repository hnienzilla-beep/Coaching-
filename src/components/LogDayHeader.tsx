import { useState, type ReactNode } from 'react'
import { todayIso } from '../db/queries'
import DayStrip, { type DayMarker } from './DayStrip'
import { Button, Card, Input } from './ui'

export type LogDayStatus = 'none' | 'open' | 'done'

const STATUS_LABEL: Record<LogDayStatus, string> = {
  none: 'Kein Eintrag',
  open: 'Offen',
  done: '✓ Abgeschlossen',
}

function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
}

/**
 * Gemeinsamer Kopf beider Tages-Logs: welcher Tag, in welchem Zustand, und der Wechsel
 * zu einem anderen Tag - alles an einer Stelle statt wie früher verteilt auf ein
 * Datumsfeld oben und die Verlaufsliste unten.
 */
export default function LogDayHeader({
  title,
  selectedDate,
  onSelectDate,
  markers,
  status,
  onDelete,
  deleteConfirmText,
  children,
}: {
  title: string
  selectedDate: string
  onSelectDate: (date: string) => void
  markers: Map<string, DayMarker>
  status: LogDayStatus
  onDelete?: () => void
  deleteConfirmText?: string
  children?: ReactNode // z.B. die Timer-Zeile des Trainingslogs
}) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const today = todayIso()

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
          <p className="truncate text-base font-semibold text-fg">
            {selectedDate === today ? 'Heute' : formatDay(selectedDate)}
          </p>
          <p className="text-xs text-muted">
            {selectedDate === today ? formatDay(selectedDate) : ''}
            {selectedDate === today ? ' · ' : ''}
            {STATUS_LABEL[status]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            onClick={() => setCalendarOpen((v) => !v)}
            aria-expanded={calendarOpen}
            aria-label="Anderen Tag wählen"
          >
            📅
          </Button>
          {onDelete && (
            <Button
              variant="ghost"
              aria-label="Eintrag löschen"
              onClick={() => {
                if (window.confirm(deleteConfirmText ?? 'Diesen Eintrag wirklich löschen?')) onDelete()
              }}
            >
              🗑
            </Button>
          )}
        </div>
      </div>

      {calendarOpen && (
        <Input
          type="date"
          value={selectedDate}
          max={today}
          onChange={(e) => {
            if (!e.target.value) return
            onSelectDate(e.target.value)
            setCalendarOpen(false)
          }}
        />
      )}

      <DayStrip selectedDate={selectedDate} onSelect={onSelectDate} markers={markers} />

      {children}
    </Card>
  )
}
