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
    <div className="flex items-center justify-between gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-fg">
      <span>Heute noch nicht eingetragen.</span>
      {permission === 'default' && (
        <Button variant="ghost" className="shrink-0 text-xs" onClick={() => Notification.requestPermission().then(setPermission)}>
          Erinnerung erlauben
        </Button>
      )}
    </div>
  )
}
