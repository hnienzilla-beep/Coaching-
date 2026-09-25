import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from './ui'

// Wie oft eine laufende App auf dem Server nach einer neuen Version fragt. iOS prüft bei einer
// Home-Bildschirm-App sonst praktisch nie von selbst - sie bliebe tagelang auf dem alten Stand.
const CHECK_INTERVAL_MS = 30 * 60 * 1000

/**
 * Hinweis auf eine neue App-Version. Der Service Worker lädt Updates im Hintergrund, aktiviert
 * sie aber erst auf Knopfdruck - vorher lief die neue Version erst nach einem kompletten
 * Neustart der App, ohne dass man davon etwas erfuhr.
 */
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return
      const check = async () => {
        // Offline oder bereits beim Installieren: nicht nachfragen, das schlägt nur fehl.
        if (!navigator.onLine || registration.installing) return
        try {
          const res = await fetch(swUrl, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } })
          if (res.status === 200) await registration.update()
        } catch {
          // Netz weg - beim nächsten Mal wieder.
        }
      }
      setInterval(() => void check(), CHECK_INTERVAL_MS)
      // Beim Zurückholen der App aus dem Hintergrund sofort prüfen - der häufigste Moment,
      // in dem ein Update schon bereitliegt.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void check()
      })
    },
  })

  if (!needRefresh) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div
        role="alert"
        className="pointer-events-auto flex w-full max-w-md flex-col gap-3 rounded-2xl border border-border bg-surface-2 px-4 py-3 shadow-2xl shadow-black/50"
      >
        <div>
          <p className="text-sm font-semibold text-fg">Neues Update verfügbar</p>
          <p className="text-xs text-muted">Starte die App neu, um die neue Version zu laden.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setNeedRefresh(false)}>
            Später
          </Button>
          <Button variant="primary" onClick={() => void updateServiceWorker(true)} className="flex-1">
            Jetzt neu starten
          </Button>
        </div>
      </div>
    </div>
  )
}
