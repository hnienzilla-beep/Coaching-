import { useState, type ReactNode } from 'react'
import { addDays, todayIso } from '../db/queries'
import DayStrip, { type DayMarker } from './DayStrip'
import { startOfWeek } from '../lib/calendar'
import MonthCalendarSheet from './MonthCalendarSheet'
import { Card } from './ui'

export type LogDayStatus = 'none' | 'open' | 'done' | 'logged'

const STATUS_LABEL: Record<LogDayStatus, string> = {
  none: 'Kein Eintrag',
  open: 'Offen',
  done: '✓ Abgeschlossen',
  logged: 'Erfasst', // Ernährungslog: kein Abschließen, ein Tag mit Einträgen ist einfach erfasst
}

function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
}

/** "Heute"/"Morgen"/"Gestern" statt des Datums - beim Vorausplanen die häufigsten drei Tage. */
function relativeDay(iso: string, today: string): string | undefined {
  if (iso === today) return 'Heute'
  if (iso === addDays(today, 1)) return 'Morgen'
  if (iso === addDays(today, -1)) return 'Gestern'
  return undefined
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
  allowFuture = false,
  children,
}: {
  title: string
  selectedDate: string
  onSelectDate: (date: string) => void
  markers: Map<string, DayMarker>
  status: LogDayStatus
  onDelete?: () => void
  deleteConfirmText?: string
  /** Künftige Tage zulassen - siehe `DayStrip`. Betrifft Wochenleiste und Kalenderfeld. */
  allowFuture?: boolean
  children?: ReactNode // z.B. die Timer-Zeile des Trainingslogs
}) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const today = todayIso()
  const relative = relativeDay(selectedDate, today)
  // Die Folgewoche ist nur erreichbar, wenn dort schon ein wählbarer Tag liegt.
  const nextWeekStart = addDays(startOfWeek(selectedDate), 7)
  const nextDisabled = !allowFuture && nextWeekStart > today

  function shiftWeek(delta: number) {
    const target = addDays(selectedDate, delta * 7)
    // In der laufenden Woche nicht über heute hinaus - sonst landete man auf einem
    // gesperrten Tag.
    onSelectDate(!allowFuture && target > today ? today : target)
  }

  return (
    <Card className="flex flex-col gap-3">
      {/* Der Titel steht nur für Screenreader da - sichtbar sagt es schon der Reiter. */}
      <h2 className="sr-only">{title}</h2>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => shiftWeek(-1)}
          aria-label="Vorherige Woche"
          className="shrink-0 rounded-lg px-2 py-1 text-2xl leading-none text-muted hover:text-fg"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => setCalendarOpen(true)}
          aria-label="Anderen Tag wählen"
          className="flex min-w-0 flex-1 flex-col items-center rounded-lg py-0.5 text-center hover:bg-surface-2"
        >
          <span className="truncate text-base font-semibold text-fg">{relative ?? formatDay(selectedDate)}</span>
          <span className="truncate text-xs text-muted">
            {/* Bei "Heute"/"Gestern" steht das ausgeschriebene Datum darunter, sonst stünde es doppelt. */}
            {relative ? `${formatDay(selectedDate)} · ` : ''}
            {STATUS_LABEL[status]} ▾
          </span>
        </button>
        <button
          type="button"
          onClick={() => shiftWeek(1)}
          disabled={nextDisabled}
          aria-label="Nächste Woche"
          className="shrink-0 rounded-lg px-2 py-1 text-2xl leading-none text-muted hover:text-fg disabled:opacity-30"
        >
          ›
        </button>
        {onDelete && (
          <button
            type="button"
            aria-label="Eintrag löschen"
            onClick={() => {
              if (window.confirm(deleteConfirmText ?? 'Diesen Eintrag wirklich löschen?')) onDelete()
            }}
            className="shrink-0 rounded-lg px-1.5 py-1 text-sm text-muted hover:text-danger"
          >
            🗑
          </button>
        )}
      </div>

      <DayStrip selectedDate={selectedDate} onSelect={onSelectDate} markers={markers} allowFuture={allowFuture} />

      {children}

      <MonthCalendarSheet
        open={calendarOpen}
        selectedDate={selectedDate}
        markers={markers}
        allowFuture={allowFuture}
        onSelect={onSelectDate}
        onClose={() => setCalendarOpen(false)}
      />
    </Card>
  )
}
