import { useMemo, useState } from 'react'
import { Input } from './ui'

export interface SearchPickerItem {
  id: string
  label: string
  sublabel?: string
}

export default function SearchPicker({
  items,
  value,
  onChange,
  placeholder = 'Suchen...',
}: {
  items: SearchPickerItem[]
  value: string | undefined
  onChange: (id: string) => void
  placeholder?: string
}) {
  const selected = items.find((i) => i.id === value)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items.slice(0, 30)
    return items.filter((i) => i.label.toLowerCase().includes(q)).slice(0, 30)
  }, [items, query])

  return (
    <div className="relative">
      <Input
        placeholder={placeholder}
        value={open ? query : (selected?.label ?? '')}
        onFocus={() => {
          setQuery('')
          setOpen(true)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQuery(e.target.value)}
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-surface-2 shadow-xl">
          {filtered.length === 0 && <div className="px-3 py-2 text-sm text-muted">Keine Treffer</div>}
          {filtered.map((i) => (
            <button
              key={i.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(i.id)
                setOpen(false)
              }}
              className="block w-full px-3 py-2 text-left text-sm text-zinc-100 hover:bg-accent/10"
            >
              {i.label} {i.sublabel && <span className="text-xs text-muted">({i.sublabel})</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
