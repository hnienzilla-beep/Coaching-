import { useEffect, useRef, type RefObject } from 'react'

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

// Bewusst großzügig: Die erste Fassung (70 px, nahezu waagerecht, < 0,7 s) löste auf dem
// iPhone oft erst nach mehreren Versuchen aus.
const DECIDE_AFTER = 10 // px, ab denen feststeht, ob waagerecht gewischt oder gescrollt wird
const MIN_DISTANCE = 60
const FLICK_DISTANCE = 30 // kurzer, schneller Wisch reicht auch
const FLICK_SPEED = 0.35 // px/ms
// Waagerecht scrollende Leisten und Zuggriffe haben eigene Gesten. Eingabefelder nur, solange
// darin getippt wird - sonst wären ganze Seiten (Tracking, Trainingslog) kaum wischbar.
const IGNORE = '[data-no-swipe], .overflow-x-auto, .touch-none'

function blocksSwipe(target: Element): boolean {
  if (target.closest(IGNORE)) return true
  const field = target.closest('input, textarea, select')
  return !!field && field === document.activeElement
}

/**
 * Markiert ein Touch-Ereignis als "gehört einer inneren Geste" (Eintrag wegwischen) - dann
 * lässt der Reiterwechsel es in Ruhe. Als Eigenschaft am nativen Ereignis, weil beide Seiten
 * mit nativen Listenern arbeiten.
 */
export function claimTouch(e: TouchEvent): void {
  ;(e as TouchEvent & { swipeClaimed?: boolean }).swipeClaimed = true
}

function isClaimed(e: TouchEvent): boolean {
  return !!(e as TouchEvent & { swipeClaimed?: boolean }).swipeClaimed
}

/**
 * Waagerechtes Wischen im Bereich `area`. Der Inhalt (`content`) folgt dem Finger schon
 * während der Geste, so sieht man sofort, dass sie greift; beim Loslassen wird gewechselt oder
 * zurückgefedert.
 *
 * Mit Touch-Events statt Pointer-Events: Safari auf dem iPhone bricht Pointer-Events ab, sobald
 * der Finger auch nur leicht senkrecht wandert - daran scheiterte die erste Fassung.
 */
export function useSwipeNavigation(
  area: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
  /** Erst `true`, wenn der Bereich gerendert ist - vorher gibt es nichts, woran man hört. */
  ready: boolean,
  onSwipe: (direction: SwipeDirection) => void,
) {
  const onSwipeRef = useRef(onSwipe)
  useEffect(() => {
    onSwipeRef.current = onSwipe
  })

  useEffect(() => {
    const el = area.current
    if (!el) return
    let g: { x: number; y: number; t: number; dir: 'h' | 'v' | null; dx: number } | null = null

    function setOffset(dx: number, animate: boolean) {
      const c = content.current
      if (!c) return
      c.style.transition = animate ? 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease' : 'none'
      c.style.transform = dx ? `translateX(${dx * 0.4}px)` : ''
      c.style.opacity = dx ? String(1 - Math.min(0.35, Math.abs(dx) / 700)) : ''
    }

    function onStart(e: TouchEvent) {
      g = null
      if (e.touches.length !== 1 || blocksSwipe(e.target as Element)) return
      const t = e.touches[0]
      g = { x: t.clientX, y: t.clientY, t: Date.now(), dir: null, dx: 0 }
    }

    function onMove(e: TouchEvent) {
      if (!g) return
      if (isClaimed(e)) {
        g = null
        setOffset(0, true)
        return
      }
      const t = e.touches[0]
      const dx = t.clientX - g.x
      const dy = t.clientY - g.y
      if (g.dir === null) {
        if (Math.abs(dx) < DECIDE_AFTER && Math.abs(dy) < DECIDE_AFTER) return
        g.dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      }
      if (g.dir !== 'h') return
      g.dx = dx
      setOffset(dx, false)
    }

    function onEnd(e: TouchEvent) {
      const current = g
      g = null
      if (!current || current.dir !== 'h' || isClaimed(e)) {
        if (current?.dir === 'h') setOffset(0, true)
        return
      }
      const distance = Math.abs(current.dx)
      const speed = distance / Math.max(1, Date.now() - current.t)
      if (distance >= MIN_DISTANCE || (distance >= FLICK_DISTANCE && speed >= FLICK_SPEED)) {
        setOffset(0, false)
        onSwipeRef.current(current.dx < 0 ? 'next' : 'prev')
      } else {
        setOffset(0, true)
      }
    }

    function onCancel() {
      if (g?.dir === 'h') setOffset(0, true)
      g = null
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onCancel)
    }
  }, [area, content, ready])
}
