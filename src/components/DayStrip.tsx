import { addDays, todayIso } from '../db/queries'

/** Was an dem Tag protokolliert ist - steuert den Punkt unter der Tageszahl. */
export type DayMarker = 'open' | 'done'

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

/** Montag der Woche, in der `iso` liegt. */
function startOfWeek(iso: string): string {
  const weekday = (new Date(`${iso}T00:00:00`).getDay() + 6) % 7 // Sonntag (0) ans Wochenende schieben
  return addDays(iso, -weekday)
}

/**
 * Wochenleiste Mo-So um den gewählten Tag. Bewusst ohne Vor-/Zurück-Pfeile: weiter
 * zurückliegende Tage erreicht man über den Kalender-Button im Kopf oder den Verlauf,
 * die Leiste selbst bleibt dadurch eine reine Übersicht der laufenden Woche.
 */
export default function DayStrip({
  selectedDate,
  onSelect,
  markers,
}: {
  selectedDate: string
  onSelect: (date: string) => void
  markers: Map<string, DayMarker>
}) {
  const today = todayIso()
  const weekStart = startOfWeek(selectedDate)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map((date, i) => {
        const selected = date === selectedDate
        const future = date > today
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
            className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-center transition active:scale-95 disabled:opacity-30 disabled:active:scale-100 ${
              selected ? 'bg-accent text-accent-fg' : 'text-fg hover:bg-surface-2'
            }`}
          >
            <span className={`text-[10px] uppercase ${selected ? '' : 'text-muted'}`}>{WEEKDAYS[i]}</span>
            <span className={`text-sm tabular-nums ${date === today ? 'font-bold' : ''}`}>{Number(date.slice(8))}</span>
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
