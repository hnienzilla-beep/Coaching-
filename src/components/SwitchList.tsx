/** Liste von Schaltern mit Titel und Hinweis - für Einstellungen wie Story-Folien oder Dashboard-Karten. */
export default function SwitchList<T extends string>({
  items,
  isOn,
  onToggle,
}: {
  items: readonly { id: T; label: string; hint: string }[]
  isOn: (id: T) => boolean
  onToggle: (id: T, on: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) => {
        const on = isOn(item.id)
        return (
          <button
            key={item.id}
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() => onToggle(item.id, !on)}
            className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-fg">{item.label}</span>
              <span className="block truncate text-xs text-muted">{item.hint}</span>
            </span>
            <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-border'}`}>
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
              />
            </span>
          </button>
        )
      })}
    </div>
  )
}
