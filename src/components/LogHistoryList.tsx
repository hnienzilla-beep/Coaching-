import { Card } from './ui'

export interface LogHistoryEntry {
  date: string
  done?: boolean
  /** Kurzfassung des Tages, z.B. "Push · 48:12" oder "1.840 kcal" */
  summary?: string
}

function formatShortDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

/** Verlaufsliste beider Tages-Logs - vorher zweimal fast gleich in den Seiten selbst. */
export default function LogHistoryList({
  entries,
  selectedDate,
  onSelect,
  emptyText,
}: {
  entries: LogHistoryEntry[]
  selectedDate: string
  onSelect: (date: string) => void
  emptyText: string
}) {
  return (
    <Card className="flex flex-col gap-1">
      <h2 className="pb-1 text-sm font-semibold uppercase tracking-wide text-muted">Verlauf</h2>
      {entries.length === 0 && <p className="text-sm text-muted">{emptyText}</p>}
      <div className="flex max-h-64 flex-col overflow-y-auto">
        {entries.map((entry) => (
          <button
            key={entry.date}
            onClick={() => onSelect(entry.date)}
            className={`flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm ${
              entry.date === selectedDate ? 'bg-surface-2' : ''
            }`}
          >
            <span className="shrink-0 text-muted">{formatShortDay(entry.date)}</span>
            <span className="truncate text-right text-fg">
              {entry.done ? '✓ ' : ''}
              {entry.summary}
            </span>
          </button>
        ))}
      </div>
    </Card>
  )
}
