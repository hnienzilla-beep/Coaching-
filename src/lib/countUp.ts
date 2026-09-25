import { useEffect, useRef, useState } from 'react'

export const COUNT_MS = 900

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Ease-out (kubisch): schnell los, weich ins Ziel - wie ein Tacho, der sich einpendelt. */
export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return 1 - (1 - c) ** 3
}

/** Zwischenwert der Zählanimation nach `elapsed` ms. */
export function countUpValue(from: number, to: number, elapsed: number, duration: number): number {
  if (duration <= 0) return to
  return from + (to - from) * easeOutCubic(elapsed / duration)
}

/**
 * Zahl, die beim Erscheinen von 0 hochzählt und bei späteren Änderungen vom alten zum neuen
 * Wert läuft. Die Seiten werden bei jedem Reiterwechsel (auch per Wischen) neu gemountet -
 * die Zahlen bauen sich dadurch jedes Mal sichtbar auf.
 */
export function useCountUp(value: number, duration = COUNT_MS): number {
  const reduced = prefersReducedMotion()
  const [shown, setShown] = useState(reduced ? value : 0)
  const shownRef = useRef(shown)

  useEffect(() => {
    if (reduced) {
      shownRef.current = value
      setShown(value)
      return
    }
    const from = shownRef.current
    if (from === value) return
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const next = countUpValue(from, value, now - start, duration)
      shownRef.current = next
      setShown(next)
      if (now - start < duration) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration, reduced])

  return shown
}

/**
 * `false` beim ersten Render, zwei Frames später `true`. Balken und Ringe rechnen ihre Breite
 * damit erst ab 0 - die vorhandene CSS-Transition lässt sie dann sichtbar anwachsen.
 */
export function useGrowIn(): boolean {
  const [grown, setGrown] = useState(prefersReducedMotion)
  useEffect(() => {
    if (grown) return
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setGrown(true))
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [grown])
  return grown
}

/** Linien in den recharts-Diagrammen zeichnen sich beim Erscheinen von links nach rechts. */
export function chartLineAnimation() {
  const reduced = prefersReducedMotion()
  return { isAnimationActive: !reduced, animationDuration: 1000, animationEasing: 'ease-out' as const }
}
