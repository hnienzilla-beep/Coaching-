import { useEffect, useRef, useState, type ReactNode } from 'react'
import { claimTouch } from '../lib/swipeNavigation'

const DECIDE_AFTER = 8 // px, ab denen feststeht, ob waagerecht gewischt oder senkrecht gescrollt wird
const DELETE_AT = 100 // px nach links - oder 40 % der Breite, je nachdem was kleiner ist
const FLICK_SPEED = 0.5 // px/ms - ein schneller Wisch löscht schon ab der halben Strecke

/**
 * Zeile nach links wegwischen, wie in iOS-Mail: Die Zeile folgt dem Finger, dahinter erscheint
 * "Löschen". Weit genug (oder schnell genug) gezogen gleitet sie hinaus, klappt zusammen und
 * `onDelete` läuft; sonst federt sie zurück.
 *
 * Mit nativen Touch-Events: Sobald feststeht, dass waagerecht gewischt wird, blockiert
 * `preventDefault` das Scrollen der Seite - sonst übernimmt Safari die Geste und bricht sie ab.
 * Nach rechts passiert hier nichts, diese Richtung gehört dem Wechsel zwischen den Reitern.
 */
export default function SwipeToDelete({
  onDelete,
  confirmText,
  rounded = 'rounded-xl',
  children,
}: {
  onDelete: () => void | Promise<void>
  /** Rückfrage vor dem Löschen - für Einträge, an denen noch anderes hängt. */
  confirmText?: string
  /** Rundung der Zeile - damit die rote Fläche dahinter genau passt. */
  rounded?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const justSwiped = useRef(false)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [height, setHeight] = useState<number | undefined>(undefined)

  // Die Listener leben außerhalb von React (nicht-passiv, für preventDefault) - aktuelle Props
  // holen sie sich über diese Refs.
  const onDeleteRef = useRef(onDelete)
  const confirmRef = useRef(confirmText)
  useEffect(() => {
    onDeleteRef.current = onDelete
    confirmRef.current = confirmText
  })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let g: { x: number; y: number; t: number; horizontal: boolean | null; dx: number } | null = null

    function snapBack() {
      g = null
      setDragging(false)
      setDx(0)
    }

    function onStart(e: TouchEvent) {
      g = null
      if (e.touches.length !== 1 || (e.target as Element).closest('.touch-none, input, textarea, select')) return
      const t = e.touches[0]
      g = { x: t.clientX, y: t.clientY, t: Date.now(), horizontal: null, dx: 0 }
    }

    function onMove(e: TouchEvent) {
      if (!g) return
      const t = e.touches[0]
      const moveX = t.clientX - g.x
      const moveY = t.clientY - g.y
      if (g.horizontal === null) {
        if (Math.abs(moveX) < DECIDE_AFTER && Math.abs(moveY) < DECIDE_AFTER) return
        g.horizontal = moveX < 0 && Math.abs(moveX) > Math.abs(moveY)
        if (!g.horizontal) {
          g = null
          return
        }
        setDragging(true)
      }
      e.preventDefault()
      claimTouch(e)
      g.dx = Math.min(0, moveX)
      setDx(g.dx)
    }

    function onEnd(e: TouchEvent) {
      const current = g
      g = null
      if (!current?.horizontal || !el) return
      claimTouch(e)
      justSwiped.current = true
      setTimeout(() => (justSwiped.current = false), 80)

      const width = el.offsetWidth
      const distance = -current.dx
      const speed = distance / Math.max(1, Date.now() - current.t)
      const threshold = Math.min(DELETE_AT, width * 0.4)
      if (distance < threshold && !(distance >= threshold / 2 && speed >= FLICK_SPEED)) {
        snapBack()
        return
      }
      if (confirmRef.current && !window.confirm(confirmRef.current)) {
        snapBack()
        return
      }
      setDragging(false)
      setHeight(el.offsetHeight)
      setRemoving(true)
      setDx(-width)
      // Erst hinausgleiten, dann zusammenklappen, dann wirklich löschen.
      requestAnimationFrame(() => requestAnimationFrame(() => setHeight(0)))
      setTimeout(() => void onDeleteRef.current(), 320)
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', snapBack, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', snapBack)
    }
  }, [])

  const progress = Math.min(1, -dx / DELETE_AT)

  return (
    <div
      ref={ref}
      className={`relative select-none overflow-hidden ${rounded}`}
      style={{
        height: removing ? height : undefined,
        opacity: removing && height === 0 ? 0 : 1,
        transition: removing ? 'height 260ms ease, opacity 260ms ease, margin 260ms ease' : undefined,
        marginTop: removing && height === 0 ? '-0.375rem' : undefined,
      }}
      onClickCapture={(e) => {
        if (justSwiped.current) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      <div
        aria-hidden="true"
        className={`absolute inset-0 flex items-center justify-end ${rounded} bg-danger px-5 text-sm font-semibold text-white`}
        style={{ opacity: dx < 0 ? 0.4 + progress * 0.6 : 0 }}
      >
        <span style={{ transform: `scale(${0.8 + progress * 0.2})` }}>Löschen</span>
      </div>
      <div
        style={{
          transform: dx ? `translateX(${dx}px)` : undefined,
          transition: dragging ? 'none' : 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
