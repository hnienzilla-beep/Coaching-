import { NavLink, Outlet, useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Athlete } from '../models/types'

// Gruppiert nach Themenbereich (Ernährung: Plan+Log nebeneinander, Training: Plan+Log
// nebeneinander) und als 4-Spalten-Raster statt einer scrollenden Einzelzeile
// dargestellt - dadurch sind auf einen Blick alle Bereiche sichtbar statt seitlich
// abgeschnitten/durchgescrollt werden zu müssen.
const TABS = [
  { to: '', label: 'Dashboard', end: true },
  { to: 'tracking', label: 'Tracking', end: false },
  { to: 'ernaehrung', label: 'Ernähr.-Plan', end: false },
  { to: 'ernaehrungslog', label: 'Ernähr.-Log', end: false },
  { to: 'supplemente', label: 'Supplements', end: false },
  { to: 'trainingsplan', label: 'Trainings-Plan', end: false },
  { to: 'trainingslog', label: 'Trainings-Log', end: false },
  { to: 'fotos', label: 'Fotos', end: false },
]

export default function AthleteLayout() {
  const { athleteId } = useParams()
  const athlete = useLiveQuery(() => (athleteId ? db.athletes.get(athleteId) : undefined), [athleteId])

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
        <span className="h-3 w-3 rounded-full" style={{ background: athlete.accentColor }} />
        <h1 className="flex-1 truncate text-lg font-bold text-fg">{athlete.name}</h1>
      </header>

      <nav className="grid grid-cols-4 border-b border-border">
        {TABS.map((tab) => (
          <NavLink
            key={tab.label}
            to={`/athlete/${athleteId}${tab.to ? `/${tab.to}` : ''}`}
            end={tab.end}
            className={({ isActive }) =>
              `truncate border-b-2 px-1 py-2.5 text-center text-[11px] font-medium leading-tight ${
                isActive ? 'border-accent text-accent' : 'border-transparent text-muted'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 p-4 pb-10">
        <Outlet context={{ athlete } satisfies { athlete: Athlete }} />
      </main>
    </div>
  )
}
