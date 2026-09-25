import { useRef, type PointerEvent } from 'react'

/**
 * Alle Ansichten eines Athleten als eine flache Reihe - Wischen nach links geht einen Schritt
 * weiter, nach rechts einen zurück. Unter-Reiter (Log/Plan/…) stehen als `?view=` in der
 * Adresse, damit auch sie in der Reihe vorkommen.
 */
export const SWIPE_VIEWS: { path: string; view?: string }[] = [
  { path: '' },
  { path: 'tracking' },
  { path: 'ernaehrung', view: 'log' },
  { path: 'ernaehrung', view: 'plan' },
  { path: 'ernaehrung', view: 'supplements' },
  { path: 'training', view: 'log' },
  { path: 'training', view: 'plan' },
]

/** Position in `SWIPE_VIEWS`; ohne `?view=` gilt die erste Ansicht des Reiters (Log). */
export function swipeIndex(path: string, view: string | null): number {
  const exact = SWIPE_VIEWS.findIndex((v) => v.path === path && (v.view === undefined || v.view === view))
  return exact !== -1 ? exact : SWIPE_VIEWS.findIndex((v) => v.path === path)
}

/** Richtung, aus der die neue Ansicht hereingleitet - steht im Navigations-State. */
export type SwipeDirection = 'next' | 'prev'

export function swipeAnimationClass(direction: unknown): string {
  return direction === 'next' ? 'anim-slide-from-right' : direction === 'prev' ? 'anim-slide-from-left' : 'anim-page'
}

const MIN_DISTANCE = 70
const MAX_DURATION = 700

/**
 * Erkennt ein waagerechtes Wischen per Finger. Als React-Handler statt nativer Listener, damit
 * innere Gesten (Eintrag wegwischen) das Ereignis per `stopPropagation` für sich behalten können.
 * Startet der Finger auf etwas, das selbst waagerecht reagiert (Eingabefelder, Chip-Leisten,
 * Zuggriffe), wird nichts ausgelöst.
 */
export function useSwipeNavigation(onSwipe: (direction: SwipeDirection) => void) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null)

  return {
    onPointerDown(e: PointerEvent) {
      const target = e.target as Element
      if (e.pointerType !== 'touch' || target.closest('input, textarea, select, [data-no-swipe], .overflow-x-auto, .touch-none')) {
        start.current = null
        return
      }
      start.current = { x: e.clientX, y: e.clientY, t: Date.now() }
    },
    onPointerCancel() {
      start.current = null
    },
    onPointerUp(e: PointerEvent) {
      const s = start.current
      start.current = null
      if (!s) return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - s.t > MAX_DURATION) return
      onSwipe(dx < 0 ? 'next' : 'prev')
    },
  }
}
