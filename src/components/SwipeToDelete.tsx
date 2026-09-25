import { useRef, useState, type PointerEvent, type ReactNode } from 'react'

const DECIDE_AFTER = 8 // px, ab denen feststeht, ob waagerecht gewischt oder senkrecht gescrollt wird
const DELETE_AT = 110 // px nach links - oder 40 % der Breite, je nachdem was kleiner ist

/**
 * Zeile nach links wegwischen, wie in iOS-Mail: Die Zeile folgt dem Finger, dahinter erscheint
 * "Löschen". Weit genug gezogen gleitet sie hinaus, klappt zusammen und `onDelete` läuft;
 * sonst federt sie zurück. Senkrechtes Scrollen bleibt unberührt (`touch-action: pan-y`), ein
 * Tipp auf die Zeile funktioniert weiter wie gewohnt.
 *
 * Nach rechts passiert hier nichts - diese Richtung gehört dem Wechsel zwischen den Reitern.
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
  const gesture = useRef<{ x: number; y: number; id: number; horizontal: boolean | null } | null>(null)
  const justSwiped = useRef(false)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [height, setHeight] = useState<number | undefined>(undefined)

  function reset() {
    gesture.current = null
    setDragging(false)
    setDx(0)
  }

  function onPointerDown(e: PointerEvent) {
    if (removing || (e.pointerType === 'mouse' && e.button !== 0)) return
    // Zuggriffe zum Sortieren behalten ihre eigene Geste.
    if ((e.target as Element).closest('.touch-none, input, textarea, select')) return
    gesture.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null }
  }

  function onPointerMove(e: PointerEvent) {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    const moveX = e.clientX - g.x
    const moveY = e.clientY - g.y
    if (g.horizontal === null) {
      if (Math.abs(moveX) < DECIDE_AFTER && Math.abs(moveY) < DECIDE_AFTER) return
      // Nur ein Zug nach links gehört dieser Zeile - nach rechts wird zwischen Reitern gewechselt.
      g.horizontal = Math.abs(moveX) > Math.abs(moveY) && moveX < 0
      if (!g.horizontal) {
        gesture.current = null
        return
      }
      try {
        ref.current?.setPointerCapture(e.pointerId)
      } catch {
        // Ohne Capture läuft die Geste trotzdem - nur verlässt der Finger die Zeile dann schneller.
      }
      setDragging(true)
    }
    e.stopPropagation()
    setDx(Math.min(0, moveX))
  }

  async function onPointerUp(e: PointerEvent) {
    const g = gesture.current
    if (!g || !g.horizontal) {
      gesture.current = null
      return
    }
    // Die Geste gehörte der Zeile - der Reiterwechsel im Layout soll davon nichts mitbekommen,
    // und der anschließende Klick darf kein Bearbeiten-Sheet öffnen.
    e.stopPropagation()
    justSwiped.current = true
    setTimeout(() => (justSwiped.current = false), 50)

    const width = ref.current?.offsetWidth ?? 300
    if (-dx < Math.min(DELETE_AT, width * 0.4)) {
      reset()
      return
    }
    if (confirmText && !window.confirm(confirmText)) {
      reset()
      return
    }
    gesture.current = null
    setDragging(false)
    setHeight(ref.current?.offsetHeight)
    setRemoving(true)
    setDx(-width)
    // Erst hinausgleiten, dann zusammenklappen, dann wirklich löschen.
    requestAnimationFrame(() => requestAnimationFrame(() => setHeight(0)))
    setTimeout(() => void onDelete(), 320)
  }

  const progress = Math.min(1, -dx / DELETE_AT)

  return (
    <div
      ref={ref}
      data-no-swipe
      className={`relative select-none overflow-hidden ${rounded}`}
      style={{
        touchAction: 'pan-y',
        height: removing ? height : undefined,
        opacity: removing && height === 0 ? 0 : 1,
        transition: removing ? 'height 260ms ease, opacity 260ms ease, margin 260ms ease' : undefined,
        marginTop: removing && height === 0 ? '-0.375rem' : undefined,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => void onPointerUp(e)}
      onPointerCancel={reset}
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
