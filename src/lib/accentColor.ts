import { useEffect, useState } from 'react'
import { accentForeground } from './theme'

const STORAGE_KEY = 'overviewAccentColor'

/** `null` = Akzent aus dem Theme (Weiß im Dunkel-, Schwarz im Hell-Modus). */
export type OverviewAccent = string | null

export function getStoredOverviewAccent(): OverviewAccent {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw && /^#[0-9a-f]{3,8}$/i.test(raw) ? raw : null
}

/**
 * Setzt bzw. entfernt die Akzent-Variablen auf dem Wurzelelement. Ohne Farbe greifen
 * wieder die Theme-Tokens aus `index.css`.
 */
export function applyAccentColor(color: OverviewAccent): void {
  const root = document.documentElement
  if (color) {
    root.style.setProperty('--color-accent', color)
    root.style.setProperty('--color-accent-fg', accentForeground(color))
  } else {
    root.style.removeProperty('--color-accent')
    root.style.removeProperty('--color-accent-fg')
  }
}

/** Beim App-Start einmalig anwenden, damit der Akzent auch außerhalb der Übersicht gilt. */
export function applyStoredOverviewAccent(): void {
  applyAccentColor(getStoredOverviewAccent())
}

/**
 * Akzentfarbe der Athletenübersicht (und aller Seiten außerhalb eines Athleten). Innerhalb
 * eines Athleten überschreibt dessen eigene Akzentfarbe diesen Wert, siehe `AthleteLayout`.
 */
export function useOverviewAccent(): [OverviewAccent, (color: OverviewAccent) => void] {
  const [accent, setAccent] = useState<OverviewAccent>(() => getStoredOverviewAccent())

  useEffect(() => {
    if (accent) localStorage.setItem(STORAGE_KEY, accent)
    else localStorage.removeItem(STORAGE_KEY)
    applyAccentColor(accent)
  }, [accent])

  return [accent, setAccent]
}
