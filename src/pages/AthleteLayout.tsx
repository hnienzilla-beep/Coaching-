import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { ACCENT_COLORS } from '../db/queries'
import type { Athlete } from '../models/types'

// Ernährung (Plan/Log/Supplements) und Training (Plan/Log) sind je ein Tab mit einem
// internen Umschalter auf der jeweiligen Seite selbst - dadurch bleiben nur 4
// Haupt-Tabs, die bequem in eine einzeilige Bottom-Navigation passen.
const TABS = [
  { to: '', label: 'Dashboard', end: true },
  { to: 'tracking', label: 'Tracking', end: false },
  { to: 'ernaehrung', label: 'Ernährung', end: false },
  { to: 'training', label: 'Training', end: false },
]

export default function AthleteLayout() {
  const { athleteId } = useParams()
  const athlete = useLiveQuery(() => (athleteId ? db.athletes.get(athleteId) : undefined), [athleteId])
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const colorPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!athlete?.accentColor) return
    document.documentElement.style.setProperty('--color-accent', athlete.accentColor)
    return () => {
      document.documentElement.style.removeProperty('--color-accent')
    }
  }, [athlete?.accentColor])

  useEffect(() => {
    if (!colorPickerOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setColorPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [colorPickerOpen])

  if (!athlete) {
    return (
      <div className="mx-auto max-w-md p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link to="/" className="text-sm text-accent underline">
          ← Zurück zur Athletenliste
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <header className="flex items-center gap-3 border-b border-border p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link to="/" className="text-muted">
          ←
        </Link>
        <div ref={colorPickerRef} className="relative">
          <button
            type="button"
            onClick={() => setColorPickerOpen((v) => !v)}
            aria-label="Akzentfarbe ändern"
            className="h-3 w-3 rounded-full"
            style={{ background: athlete.accentColor }}
          />
          {colorPickerOpen && (
            <div className="absolute left-0 top-[calc(100%+0.5rem)] z-10 flex w-52 flex-wrap gap-2 rounded-xl border border-border bg-surface p-2 shadow-lg shadow-black/30">
              {ACCENT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => {
                    void db.athletes.update(athlete.id, { accentColor: color })
                    setColorPickerOpen(false)
                  }}
                  aria-label={`Akzentfarbe ${color}`}
                  className="h-6 w-6 shrink-0 rounded-full"
                  style={{
                    background: color,
                    boxShadow: athlete.accentColor === color ? `0 0 0 2px var(--color-surface), 0 0 0 4px ${color}` : 'none',
                  }}
                />
              ))}
            </div>
          )}
        </div>
        <h1 className="flex-1 truncate text-lg font-bold text-fg">{athlete.name}</h1>
      </header>

      <main className="flex-1 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))]">
        <Outlet context={{ athlete } satisfies { athlete: Athlete }} />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto grid w-full max-w-md grid-cols-4 gap-1.5 border-t border-border bg-surface-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {TABS.map((tab) => (
          <NavLink
            key={tab.label}
            to={`/athlete/${athleteId}${tab.to ? `/${tab.to}` : ''}`}
            end={tab.end}
            className={({ isActive }) =>
              `truncate rounded-lg px-1 py-3 text-center text-[11px] font-medium leading-tight transition active:scale-95 ${
                isActive ? 'bg-accent text-black shadow-sm shadow-black/20' : 'text-muted hover:text-fg'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
