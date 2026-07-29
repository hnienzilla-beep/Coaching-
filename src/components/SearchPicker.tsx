import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Input, UnconfirmedBadge } from './ui'

export interface SearchPickerItem {
  id: string
  label: string
  sublabel?: string
  favorite?: boolean
  /** Geschätzte Werte (aus dem Vault übernommen) - wird als Hinweis neben dem Namen gezeigt. */
  unconfirmed?: boolean
}

export default function SearchPicker({
  items,
  value,
  onChange,
  placeholder = 'Suchen...',
  noResultsAction,
}: {
  items: SearchPickerItem[]
  value: string | undefined
  onChange: (id: string) => void
  placeholder?: string
  noResultsAction?: (query: string) => ReactNode // ersetzt den "Keine Treffer"-Text, z.B. für ein Inline-Anlegen-Formular
}) {
  const selected = items.find((i) => i.id === value)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Klick-außerhalb schließt das Dropdown (statt Blur+Timeout) - dadurch können auch
  // interaktive Inhalte in noResultsAction (z.B. Eingabefelder) fokussiert werden, ohne
  // dass das Dropdown vorher wegen des Fokuswechsels schließt.
  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Schließt das Dropdown auch dann, wenn value von außen gesetzt wird (z.B. über
  // noResultsAction) statt über einen Klick auf eine der eigenen Options-Zeilen.
  useEffect(() => {
    setOpen(false)
  }, [value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items
    return [...matched].sort((a, b) => Number(b.favorite ?? false) - Number(a.favorite ?? false)).slice(0, 30)
  }, [items, query])

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        placeholder={placeholder}
        value={open ? query : (selected?.label ?? '')}
        onFocus={() => {
          setQuery('')
          setOpen(true)
        }}
        onChange={(e) => setQuery(e.target.value)}
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-surface-2 shadow-xl">
          {filtered.length === 0 &&
            (noResultsAction ? noResultsAction(query) : <div className="px-3 py-2 text-sm text-muted">Keine Treffer</div>)}
          {filtered.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => {
                onChange(i.id)
                setOpen(false)
              }}
              className="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-accent/10"
            >
              {i.favorite && '⭐ '}
              {i.label} {i.sublabel && <span className="text-xs text-muted">({i.sublabel})</span>}
              {i.unconfirmed && <UnconfirmedBadge />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
