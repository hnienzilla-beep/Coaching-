import { useEffect, useState } from 'react'
import type { DailyEntry } from '../models/types'
import { todayIso } from '../db/queries'
import { PenLine } from 'lucide-react'

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

  // Dezent: eine schmale Zeile statt einer großen Karte.
  return (
    <div className="anim-pop flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 py-1.5 pr-1.5 pl-3 text-xs">
      <PenLine size={14} className="shrink-0 text-accent" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-fg">Heute noch nichts eingetragen</span>
      {permission === 'default' && (
        <button
          type="button"
          className="shrink-0 rounded-full px-2.5 py-1 font-medium text-accent transition active:scale-95"
          onClick={() => Notification.requestPermission().then(setPermission)}
        >
          Erinnern
        </button>
      )}
    </div>
  )
}
