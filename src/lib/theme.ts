import { useEffect, useState } from 'react'

/** Gewählte Einstellung - `system` folgt dem Hell-/Dunkelmodus des Geräts. */
export type Theme = 'dark' | 'light' | 'system'

const STORAGE_KEY = 'theme'
const EVENT = 'coach:theme'

export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'system' ? v : 'dark'
  } catch {
    return 'dark'
  }
}

const systemQuery = () => (typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null)

function resolve(theme: Theme): 'dark' | 'light' {
  if (theme !== 'system') return theme
  return systemQuery()?.matches ? 'light' : 'dark'
}

export function applyTheme(theme: Theme): void {
  const effective = resolve(theme)
  document.documentElement.classList.toggle('light', effective === 'light')
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Ohne Speicher gilt die Wahl nur bis zum Neuladen.
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', effective === 'light' ? '#fafafa' : '#000000')
}

/** Beim Start aufrufen: setzt das Theme und folgt bei `system` Änderungen am Gerät. */
export function startTheme(): void {
  applyTheme(getStoredTheme())
  systemQuery()?.addEventListener('change', () => {
    if (getStoredTheme() === 'system') applyTheme('system')
  })
}

/**
 * Passender Vordergrund (Schwarz oder Weiß) für eine beliebige Akzentfarbe. Nötig, weil
 * die Athleten-Akzentfarbe --color-accent zur Laufzeit überschreibt und Flächen wie der
 * aktive Tab oder der Primär-Button sonst je nach Farbe unlesbar werden.
 */
export function accentForeground(hex: string): string {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.replace(/./g, (c) => c + c) : value
  if (full.length !== 6) return '#000000'
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  // Relative Luminanz nach WCAG - entscheidet, ob schwarzer oder weißer Text besser trägt.
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  return luminance > 0.45 ? '#000000' : '#ffffff'
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme())
  useEffect(() => {
    const update = () => setThemeState(getStoredTheme())
    window.addEventListener(EVENT, update)
    return () => window.removeEventListener(EVENT, update)
  }, [])
  const setTheme = (next: Theme) => {
    applyTheme(next)
    setThemeState(next)
    window.dispatchEvent(new Event(EVENT))
  }
  return [theme, setTheme]
}
