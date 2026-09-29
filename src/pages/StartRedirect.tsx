import { Navigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { sortAthletes } from '../db/queries'
import { getLastAthleteId } from '../lib/lastAthlete'
import { getPrefs } from '../lib/prefs'
import { subViewQuery } from '../lib/swipeNavigation'

/**
 * Startbildschirm der App: Es gibt keine Athletenübersicht mehr, man landet direkt im
 * zuletzt geöffneten Athleten. Ist der gelöscht worden (oder gab es noch keinen), wird der
 * erste der Reihenfolge genommen.
 *
 * Ohne jeden Athleten - frische Installation - geht es zu „Dein Start“. Das ist bewusst
 * unabhängig von der Ansichts-Stufe: In der Einfach-Ansicht ist die Athletenverwaltung sonst
 * ausgeblendet, und eine frische Installation wäre eine Sackgasse.
 */
export default function StartRedirect() {
  const athletes = useLiveQuery(() => db.athletes.toArray(), [])

  // Solange die Abfrage läuft, nichts rendern - sonst ginge es bei jedem Start kurz zu
  // „Dein Start“, bevor die Weiterleitung greift.
  if (athletes === undefined) return null

  // Frische Installation: „Dein Start“ legt den ersten Athleten an.
  if (athletes.length === 0) return <Navigate to="/dein-start" replace />

  const lastId = getLastAthleteId()
  const target = athletes.find((a) => a.id === lastId) ?? sortAthletes(athletes)[0]
  // Startseite aus den Einstellungen (Dashboard liegt auf der Wurzel des Athleten).
  const start = getPrefs().startTab
  const path = start === 'dashboard' ? '' : `/${start}${subViewQuery(start)}`
  return <Navigate to={`/athlete/${target.id}${path}`} replace />
}
