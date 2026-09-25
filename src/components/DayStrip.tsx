import { addDays, todayIso } from '../db/queries'
import { startOfWeek } from '../lib/calendar'

/** Was an dem Tag protokolliert ist - steuert den Punkt unter der Tageszahl. */
export type DayMarker = 'open' | 'done'

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']


/**
 * Wochenleiste Mo-So um den gewählten Tag. Geblättert wird über die Pfeile im Kopf
 * (`LogDayHeader`), weiter zurück über den Monatskalender.
 */
export default function DayStrip({
  selectedDate,
  onSelect,
  markers,
  allowFuture = false,
}: {
  selectedDate: string
  onSelect: (date: string) => void
  markers: Map<string, DayMarker>
  /**
   * Künftige Tage anwählbar machen. Standard aus: Ein Training lässt sich nur protokollieren,
   * nachdem es stattgefunden hat. Das Ernährungslog schaltet es ein - dort ist der Tag im
   * Voraus zu füllen der normale Fall (einkaufen, vorkochen, Wettkampfwoche planen).
   */
  allowFuture?: boolean
}) {
  const today = todayIso()
  const weekStart = startOfWeek(selectedDate)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map((date, i) => {
        const selected = date === selectedDate
        const future = date > today && !allowFuture
        const marker = markers.get(date)
        return (
          <button
            key={date}
            type="button"
            disabled={future}
            onClick={() => onSelect(date)}
            aria-pressed={selected}
            aria-label={new Date(`${date}T00:00:00`).toLocaleDateString('de-DE', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
            className={`flex flex-col items-center gap-1 rounded-xl py-2 text-center transition active:scale-95 disabled:opacity-30 disabled:active:scale-100 ${
              selected
                ? 'bg-accent text-accent-fg'
                : date === today
                  ? 'border border-fg/40 text-fg'
                  : 'text-fg hover:bg-surface-2'
            }`}
          >
            <span className={`text-[10px] uppercase ${selected ? '' : 'text-muted'}`}>{WEEKDAYS[i]}</span>
            <span className="text-base font-semibold tabular-nums">{Number(date.slice(8))}</span>
            <span
              className={`h-1 w-1 rounded-full ${
                marker === undefined
                  ? 'bg-transparent'
                  : selected
                    ? 'bg-accent-fg'
                    : marker === 'done'
                      ? 'bg-ok'
                      : 'bg-accent-dim'
              }`}
            />
          </button>
        )
      })}
    </div>
  )
}
