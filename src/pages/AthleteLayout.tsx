import { NavLink, Outlet, useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Athlete } from '../models/types'

const TABS = [
  { to: '', label: 'Dashboard', end: true },
  { to: 'tracking', label: 'Tracking', end: false },
  { to: 'ernaehrung', label: 'Ernährung', end: false },
  { to: 'fotos', label: 'Fotos', end: false },
]

export default function AthleteLayout() {
  const { athleteId } = useParams()
  const athlete = useLiveQuery(() => (athleteId ? db.athletes.get(athleteId) : undefined), [athleteId])

  if (!athlete) {
    return (
      <div className="mx-auto max-w-md p-4">
        <Link to="/" className="text-sm text-accent underline">
          ← Zurück zur Athletenliste
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <header className="flex items-center gap-3 border-b border-border p-4">
        <Link to="/" className="text-muted">
          ←
        </Link>
        <span className="h-3 w-3 rounded-full" style={{ background: athlete.accentColor }} />
        <h1 className="flex-1 truncate text-lg font-bold text-zinc-100">{athlete.name}</h1>
      </header>

      <nav className="flex border-b border-border">
        {TABS.map((tab) => (
          <NavLink
            key={tab.label}
            to={`/athlete/${athleteId}${tab.to ? `/${tab.to}` : ''}`}
            end={tab.end}
            className={({ isActive }) =>
              `flex-1 border-b-2 py-3 text-center text-sm font-medium ${
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
