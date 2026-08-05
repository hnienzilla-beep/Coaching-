import { Navigate, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { sortAthletes } from '../db/queries'
import { getLastAthleteId } from '../lib/lastAthlete'
import NewAthleteForm from '../components/NewAthleteForm'

/**
 * Startbildschirm der App: Es gibt keine Athletenübersicht mehr, man landet direkt im
 * zuletzt geöffneten Athleten. Ist der gelöscht worden (oder gab es noch keinen), wird der
 * erste der Reihenfolge genommen.
 *
 * Ohne jeden Athleten - frische Installation - steht hier das Anlege-Formular. Das ist
 * bewusst unabhängig von der Ansichts-Stufe: In der Einfach-Ansicht ist die
 * Athletenverwaltung sonst ausgeblendet, und eine frische Installation wäre eine Sackgasse.
 */
export default function StartRedirect() {
  const navigate = useNavigate()
  const athletes = useLiveQuery(() => db.athletes.toArray(), [])

  // Solange die Abfrage läuft, nichts rendern - sonst blitzt das Anlege-Formular bei jedem
  // Start kurz auf, bevor die Weiterleitung greift.
  if (athletes === undefined) return null

  if (athletes.length === 0) {
    return (
      <div className="mx-auto flex h-full max-w-md flex-col gap-4 overflow-y-auto overscroll-contain p-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
        <div>
          <h1 className="text-xl font-bold text-fg">Willkommen</h1>
          <p className="text-sm text-muted">Leg deinen ersten Athleten an, dann kann es losgehen.</p>
        </div>
        <NewAthleteForm onCreated={(athlete) => navigate(`/athlete/${athlete.id}`, { replace: true })} />
      </div>
    )
  }

  const lastId = getLastAthleteId()
  const target = athletes.find((a) => a.id === lastId) ?? sortAthletes(athletes)[0]
  return <Navigate to={`/athlete/${target.id}`} replace />
}
