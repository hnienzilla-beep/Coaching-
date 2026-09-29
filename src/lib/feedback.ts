// Kleine Rückmeldungen: kurzes Vibrieren bei Aktionen und Konfetti, wenn etwas geschafft ist.
//
// Vibration gibt es nur dort, wo der Browser `navigator.vibrate` anbietet (Android). Safari auf
// dem iPhone kennt die Schnittstelle nicht - dort bleibt es still, ohne Fehler.

import { getPrefs } from './prefs'

type Haptic = 'tap' | 'success' | 'warning'

const PATTERNS: Record<Haptic, number | number[]> = {
  tap: 12,
  success: [18, 60, 28],
  warning: [40, 50, 40],
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function haptic(kind: Haptic = 'tap'): void {
  if (!getPrefs().haptics) return
  try {
    if (typeof navigator !== 'undefined') navigator.vibrate?.(PATTERNS[kind])
  } catch {
    // Manche Browser werfen außerhalb einer Nutzergeste - dann eben ohne.
  }
}

/**
 * Feiert genau einmal je Schlüssel (z. B. "kcal-2026-09-29-<athlet>") - wer danach noch etwas
 * einträgt oder die Seite neu lädt, bekommt nicht jedes Mal wieder Konfetti.
 */
export function celebrateOnce(key: string): void {
  const storageKey = `coach.celebrated.${key}`
  try {
    if (localStorage.getItem(storageKey)) return
    localStorage.setItem(storageKey, '1')
  } catch {
    // Ohne Speicher lieber gar nicht feiern als bei jedem Render.
    return
  }
  celebrate()
}

const COLORS = ['#a3e635', '#22d3ee', '#f472b6', '#facc15', '#fb923c', '#c084fc', '#ffffff']

/** Konfetti über den ganzen Bildschirm, rund 2 Sekunden, dazu ein Erfolgs-Vibrieren. */
export function celebrate(): void {
  haptic('success')
  const prefs = getPrefs()
  if (typeof document === 'undefined' || reducedMotion() || !prefs.confetti || prefs.animations === 'off') return

  const canvas = document.createElement('canvas')
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: `${w}px`,
    height: `${h}px`,
    pointerEvents: 'none',
    zIndex: '100',
  })
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return
  }
  ctx.scale(dpr, dpr)

  const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim()
  const palette = accent ? [accent, accent, ...COLORS] : COLORS
  // Zwei Kanonen unten links und rechts, schräg nach innen oben.
  const particles = Array.from({ length: 140 }, (_, i) => {
    const left = i % 2 === 0
    const angle = (left ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9
    const speed = 9 + Math.random() * 8
    return {
      x: left ? 0 : w,
      y: h * 0.85,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: palette[Math.floor(Math.random() * palette.length)],
    }
  })

  const start = performance.now()
  const DURATION = 2200
  const frame = (now: number) => {
    const t = now - start
    ctx.clearRect(0, 0, w, h)
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - DURATION * 0.6) / (DURATION * 0.4))
    for (const p of particles) {
      p.vy += 0.28
      p.vx *= 0.99
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      ctx.restore()
    }
    if (t < DURATION) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}
