import { useEffect, useState } from 'react'
import type { DailyEntry } from '../models/types'
import { todayIso } from '../db/queries'
import { Button } from './ui'

// iOS/Safari erlaubt für installierte Web-Apps nur Web Push (eigener Server nötig).
// Ohne Backend gibt es daher keine echte Erinnerung bei geschlossener App - wir zeigen
// stattdessen einen In-App-Hinweis und bieten optional die Notification-Berechtigung an,
// die für Hinweise während die App im Hintergrund/aktiv ist genutzt werden kann.
export default function ReminderBanner({ entries }: { athleteId: string; entries: DailyEntry[] }) {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')

  useEffect(() => {
    if (typeof Notification === 'undefined') {
      setPermission('unsupported')
    } else {
      setPermission(Notification.permission)
    }
  }, [])

  const today = todayIso()
  const todayEntry = entries.find((e) => e.date === today)
  const loggedToday = todayEntry && (todayEntry.weightKg !== undefined || todayEntry.calories !== undefined)

  if (loggedToday) return null

  return (
    <div className="anim-pop flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3">
      <span className="text-xl" aria-hidden="true">
        ✍️
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">Heute noch nichts eingetragen</p>
        <p className="text-xs text-muted">Gewicht unter „Tracking“, Essen unter „Ernährung“.</p>
      </div>
      {permission === 'default' && (
        <Button variant="ghost" className="shrink-0 text-xs" onClick={() => Notification.requestPermission().then(setPermission)}>
          Erinnern
        </Button>
      )}
    </div>
  )
}
