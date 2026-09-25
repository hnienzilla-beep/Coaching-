import { useEffect, useRef, type RefObject } from 'react'

/**
 * Alle Ansichten eines Athleten als eine flache Reihe - Wischen nach links geht einen Schritt
 * weiter, nach rechts einen zurück. Unter-Reiter (Log/Plan/…) stehen als `?view=` in der
 * Adresse, damit auch sie in der Reihe vorkommen.
 */
export const SWIPE_VIEWS: { path: string; view?: string; label: string }[] = [
  { path: '', label: 'Dashboard' },
  { path: 'tracking', label: 'Tracking' },
  { path: 'ernaehrung', view: 'log', label: 'Ernährung · Log' },
  { path: 'ernaehrung', view: 'plan', label: 'Ernährung · Plan' },
  { path: 'ernaehrung', view: 'supplements', label: 'Supplements' },
  { path: 'training', view: 'log', label: 'Training · Log' },
  { path: 'training', view: 'plan', label: 'Training · Plan' },
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

const DECIDE_AFTER = 10 // px, ab denen feststeht, ob waagerecht gewischt oder gescrollt wird
const COMMIT_FRACTION = 0.25 // Anteil der Breite, ab dem beim Loslassen gewechselt wird
const FLICK_DISTANCE = 30 // kurzer, schneller Wisch reicht auch
const FLICK_SPEED = 0.35 // px/ms
const RUBBER_BAND = 0.25 // am Anfang/Ende der Reihe folgt der Inhalt nur gebremst
const OUT_MS = 180
// Waagerecht scrollende Leisten und Zuggriffe haben eigene Gesten. Eingabefelder nur, solange
// darin getippt wird - sonst wären ganze Seiten (Tracking, Trainingslog) kaum wischbar.
const IGNORE = '[data-no-swipe], .overflow-x-auto, .touch-none'

function blocksSwipe(target: Element): boolean {
  if (target.closest(IGNORE)) return true
  const field = target.closest('input, textarea, select')
  return !!field && field === document.activeElement
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
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
 * Blättern zwischen den Ansichten per Wischen - wie in einer iOS-App:
 * - Der Inhalt (`content`) klebt 1:1 am Finger, am Rand zeigt `hint`, wohin es geht.
 * - Beim Loslassen (ab einem Viertel der Breite oder mit schnellem Wisch) gleitet die Seite
 *   ganz hinaus, erst dann wird gewechselt; die neue Seite kommt aus der Gegenrichtung.
 * - Sonst federt sie mit leichtem Nachschwingen zurück. Am Anfang und Ende der Reihe gibt es
 *   Gummiband-Widerstand.
 *
 * Native Touch-Listener (Safari bricht Pointer-Events beim leichtesten senkrechten Anteil ab),
 * `touchmove` nicht-passiv: Ist die Geste als waagerecht erkannt, scrollt die Seite nicht mehr
 * mit. Alle Verschiebungen laufen direkt über Styles, ohne React-Render je Fingerbewegung.
 */
export function useSwipeNavigation({
  area,
  content,
  hint,
  ready,
  targetLabel,
  onSwipe,
}: {
  area: RefObject<HTMLElement | null>
  content: RefObject<HTMLElement | null>
  hint: RefObject<HTMLElement | null>
  /** Erst `true`, wenn der Bereich gerendert ist - vorher gibt es nichts, woran man hört. */
  ready: boolean
  /** Name der Ansicht in dieser Richtung - `null` am Anfang bzw. Ende der Reihe. */
  targetLabel: (direction: SwipeDirection) => string | null
  onSwipe: (direction: SwipeDirection) => void
}) {
  const latest = useRef({ targetLabel, onSwipe })
  useEffect(() => {
    latest.current = { targetLabel, onSwipe }
  })

  useEffect(() => {
    const el = area.current
    if (!el) return
    let g: {
      x: number
      y: number
      t: number
      dir: 'h' | 'v' | null
      dx: number
      width: number
      busy?: boolean
    } | null = null
    let animating = false

    function style(dx: number, transition: string) {
      const c = content.current
      if (c) {
        const progress = Math.min(1, Math.abs(dx) / (g?.width ?? 400))
        c.style.transition = transition
        c.style.transform = dx ? `translateX(${dx}px) scale(${1 - progress * 0.03})` : ''
        c.style.opacity = dx ? String(1 - progress * 0.25) : ''
        c.style.willChange = dx ? 'transform' : ''
      }
    }

    function showHint(dx: number) {
      const h = hint.current
      if (!h) return
      const direction: SwipeDirection = dx < 0 ? 'next' : 'prev'
      const label = dx ? latest.current.targetLabel(direction) : null
      if (!label) {
        h.style.opacity = '0'
        return
      }
      h.textContent = direction === 'next' ? `${label} ›` : `‹ ${label}`
      h.style.left = direction === 'prev' ? '12px' : ''
      h.style.right = direction === 'next' ? '12px' : ''
      h.style.opacity = String(Math.min(1, Math.abs(dx) / 90))
      h.style.transform = `translateY(-50%) scale(${0.9 + Math.min(1, Math.abs(dx) / 120) * 0.1})`
    }

    function springBack() {
      style(0, 'transform 350ms cubic-bezier(0.34, 1.4, 0.64, 1), opacity 250ms ease')
      showHint(0)
    }

    function onStart(e: TouchEvent) {
      if (animating) return
      if (e.touches.length !== 1) {
        if (g?.dir === 'h') springBack()
        g = null
        return
      }
      g = null
      if (blocksSwipe(e.target as Element)) return
      const t = e.touches[0]
      g = { x: t.clientX, y: t.clientY, t: Date.now(), dir: null, dx: 0, width: el!.clientWidth }
    }

    function onMove(e: TouchEvent) {
      if (!g) return
      if (isClaimed(e)) {
        if (g.dir === 'h') springBack()
        g = null
        return
      }
      const t = e.touches[0]
      const rawDx = t.clientX - g.x
      const dy = t.clientY - g.y
      if (g.dir === null) {
        if (Math.abs(rawDx) < DECIDE_AFTER && Math.abs(dy) < DECIDE_AFTER) return
        g.dir = Math.abs(rawDx) > Math.abs(dy) ? 'h' : 'v'
      }
      if (g.dir !== 'h') return
      // Ab hier gehört die Geste dem Blättern - die Seite scrollt nicht mehr senkrecht mit.
      e.preventDefault()
      const possible = latest.current.targetLabel(rawDx < 0 ? 'next' : 'prev') !== null
      g.dx = possible ? rawDx : rawDx * RUBBER_BAND
      if (reducedMotion()) return
      style(g.dx, 'none')
      showHint(possible ? g.dx : 0)
    }

    function onEnd(e: TouchEvent) {
      const current = g
      g = null
      if (!current || current.dir !== 'h') return
      if (isClaimed(e)) {
        springBack()
        return
      }
      const direction: SwipeDirection = current.dx < 0 ? 'next' : 'prev'
      const distance = Math.abs(current.dx)
      const speed = distance / Math.max(1, Date.now() - current.t)
      const commit =
        latest.current.targetLabel(direction) !== null &&
        (distance >= current.width * COMMIT_FRACTION || (distance >= FLICK_DISTANCE && speed >= FLICK_SPEED))
      if (!commit) {
        springBack()
        return
      }
      showHint(0)
      if (reducedMotion()) {
        latest.current.onSwipe(direction)
        return
      }
      // Ganz hinausschieben, dann wechseln. Die Hülle bleibt unsichtbar, bis die neue Ansicht
      // gerendert ist - sonst blitzte die alte an ihrem Platz noch einmal auf.
      animating = true
      style(direction === 'next' ? -current.width : current.width, `transform ${OUT_MS}ms cubic-bezier(0.4, 0, 1, 1), opacity ${OUT_MS}ms ease-in`)
      setTimeout(() => {
        const c = content.current
        if (c) {
          c.style.transition = 'none'
          c.style.transform = ''
          c.style.willChange = ''
          c.style.opacity = '0'
        }
        latest.current.onSwipe(direction)
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (content.current) content.current.style.opacity = ''
            animating = false
          }),
        )
      }, OUT_MS)
    }

    function onCancel() {
      if (g?.dir === 'h') springBack()
      g = null
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onCancel)
    }
  }, [area, content, hint, ready])
}
