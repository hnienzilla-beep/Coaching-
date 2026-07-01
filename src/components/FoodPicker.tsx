import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { Input } from './ui'

export default function FoodPicker({
  value,
  onChange,
}: {
  value: string | undefined
  onChange: (foodItemId: string) => void
}) {
  const foods = useLiveQuery(() => db.foodItems.orderBy('name').toArray(), [])
  const selected = foods?.find((f) => f.id === value)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    if (!foods) return []
    const q = query.trim().toLowerCase()
    if (!q) return foods.slice(0, 30)
    return foods.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 30)
  }, [foods, query])

  return (
    <div className="relative">
      <Input
        placeholder="Lebensmittel suchen..."
        value={open ? query : (selected?.name ?? '')}
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
          {filtered.map((f) => (
            <button
              key={f.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(f.id)
                setOpen(false)
              }}
              className="block w-full px-3 py-2 text-left text-sm text-zinc-100 hover:bg-accent/10"
            >
              {f.name} <span className="text-xs text-muted">({f.kcal} kcal/100g)</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
