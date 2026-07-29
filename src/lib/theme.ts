import { useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'theme'

export function getStoredTheme(): Theme {
  return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('light', theme === 'light')
  localStorage.setItem(STORAGE_KEY, theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#fafafa' : '#000000')
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
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme())

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return [theme, setTheme]
}
