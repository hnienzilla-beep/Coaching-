import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { ACCENT_COLORS } from '../db/queries'
import { applyAccentColor, getStoredOverviewAccent } from '../lib/accentColor'
import { AccentSwatch } from '../components/ui'
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
  const { pathname } = useLocation()
  const athlete = useLiveQuery(() => (athleteId ? db.athletes.get(athleteId) : undefined), [athleteId])
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)

  // Gescrollt wird im <main>, nicht im Dokument - den Scroll beim Reiterwechsel
  // zurücksetzen übernimmt der Router deshalb nicht mehr.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  // Beim Verlassen des Athleten zurück auf die Akzentfarbe der Übersicht - nicht einfach
  // entfernen, sonst ginge eine dort eingestellte Farbe verloren.
  useEffect(() => {
    if (!athlete?.accentColor) return
    applyAccentColor(athlete.accentColor)
    return () => applyAccentColor(getStoredOverviewAccent())
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
      <div className="mx-auto h-full max-w-md overflow-y-auto p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link to="/" className="text-sm text-accent underline">
          ← Zurück zur Athletenliste
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col overflow-hidden">
      <header className="shrink-0 flex items-center gap-3 border-b border-border p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link to="/" className="text-muted">
          ←
        </Link>
        <div ref={colorPickerRef} className="relative">
          <button
            type="button"
            onClick={() => setColorPickerOpen((v) => !v)}
            aria-label="Akzentfarbe ändern"
            className="h-3 w-3 rounded-full border border-border"
            style={{ background: athlete.accentColor }}
          />
          {colorPickerOpen && (
            <div className="absolute left-0 top-[calc(100%+0.5rem)] z-10 flex w-52 flex-wrap gap-2 rounded-xl border border-border bg-surface p-2 shadow-lg shadow-black/30">
              {ACCENT_COLORS.map((color) => (
                <AccentSwatch
                  key={color}
                  color={color}
                  selected={athlete.accentColor === color}
                  onSelect={(picked) => {
                    void db.athletes.update(athlete.id, { accentColor: picked })
                    setColorPickerOpen(false)
                  }}
                />
              ))}
            </div>
          )}
        </div>
        <h1 className="flex-1 truncate text-lg font-bold text-fg">{athlete.name}</h1>
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto overscroll-contain p-4 pb-6">
        <Outlet context={{ athlete } satisfies { athlete: Athlete }} />
      </main>

      {/* Unten nur die halbe Safe Area als Polster: Der volle Systemabstand (34px auf dem
          iPhone) schiebt die Reiter spürbar vom Bildschirmrand weg, so viel Platz braucht
          der Home-Indikator nicht. `max(0.5rem, …)` hält ohne Safe Area (Desktop) ein
          Mindestpolster, damit die Reiter nicht am Rand kleben. */}
      <nav className="grid shrink-0 grid-cols-4 gap-1.5 border-t border-border bg-bg/85 p-2 pb-[max(0.5rem,calc(env(safe-area-inset-bottom)*0.5))] backdrop-blur-xl">
        {TABS.map((tab) => (
          <NavLink
            key={tab.label}
            to={`/athlete/${athleteId}${tab.to ? `/${tab.to}` : ''}`}
            end={tab.end}
            className={({ isActive }) =>
              `truncate rounded-lg px-1 py-3 text-center text-[11px] font-medium leading-tight transition active:scale-95 ${
                isActive ? 'bg-accent text-accent-fg shadow-sm shadow-black/20' : 'text-muted hover:text-fg'
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
