/**
 * Chip-Reihe für Gruppen, die es an diesem Tag / in dieser Phase noch nicht gibt - so wird die
 * Gruppe vor dem Anlegen gewählt, statt jede neue Zeile hinterher per Auswahlfeld umzusortieren.
 */
export default function GroupAddChips<T extends string>({
  label,
  options,
  used,
  onAdd,
  highlight,
}: {
  label: string
  options: readonly T[]
  used: Set<T>
  onAdd: (option: T) => void
  highlight?: T // z.B. die zur Uhrzeit passende Mahlzeit
}) {
  const available = options.filter((o) => !used.has(o))
  if (available.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {available.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onAdd(option)}
            className={`rounded-full border px-3 py-1.5 text-xs transition active:scale-95 ${
              option === highlight ? 'border-fg font-medium text-fg' : 'border-border text-muted hover:text-fg'
            }`}
          >
            + {option}
          </button>
        ))}
      </div>
    </div>
  )
}
