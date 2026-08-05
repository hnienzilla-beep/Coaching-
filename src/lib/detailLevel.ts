/**
 * Wie viel die App zeigt - eine von drei Stufen, geräteweit in localStorage.
 *
 * - `einfach`: nur das Nötigste. Alles Zusätzliche wird gar nicht erst gerendert, es gibt
 *   also auch keine Kopfzeile zum Aufklappen. Gedacht für Anfänger, die sich sonst in
 *   Diagrammen, Export-Funktionen und Detailfeldern verlieren.
 * - `normal`: Tracking und Pläne ohne Coach-Details (entspricht dem früheren "Coach-Modus: Aus").
 * - `coach`: alles sichtbar (entspricht dem früheren "Coach-Modus: An", weiterhin Standard).
 *
 * Bewusst als Store mit Abo (statt eines eigenen `useState` je Hook wie früher in
 * `coachMode.ts`/`compactMode.ts`): Die Stufe wird von einem guten Dutzend Komponenten
 * gelesen, und ein Wechsel im Zahnrad-Menü muss überall sofort wirken - nicht erst beim
 * nächsten Mounten. Muster wie in `features/obsidianSync/syncState.ts`.
 */

import { useSyncExternalStore } from 'react'

export type DetailLevel = 'einfach' | 'normal' | 'coach'

export const DETAIL_LEVELS: { key: DetailLevel; label: string; hint: string }[] = [
  { key: 'einfach', label: 'Einfach', hint: 'Nur das Nötigste - ideal für den Einstieg.' },
  { key: 'normal', label: 'Normal', hint: 'Tracking und Pläne ohne Coach-Details.' },
  { key: 'coach', label: 'Coach', hint: 'Alle Felder, Diagramme und Export-Funktionen.' },
]

const STORAGE_KEY = 'detailLevel'
const LEGACY_COACH_KEY = 'coachMode'
const LEGACY_COMPACT_KEY = 'compactMode'

function isDetailLevel(value: string | null): value is DetailLevel {
  return value === 'einfach' || value === 'normal' || value === 'coach'
}

/**
 * Vorher gab es zwei Schalter: "Coach-Modus" (Standard an) und "Karten einklappen".
 * Der Coach-Modus wird auf die neue Stufe abgebildet; "Karten einklappen" wirkte nur auf
 * eine einzige Karte, die ohnehin nur in der Coach-Stufe erscheint, und entfällt ersatzlos.
 * Unbekannte Werte landen auf `coach` - ein kaputter Eintrag soll niemandem die App leerräumen.
 */
function loadLevel(): DetailLevel {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isDetailLevel(stored)) return stored

    const legacyCoach = localStorage.getItem(LEGACY_COACH_KEY)
    // Frische Installation: Standard zurückgeben, ohne zu schreiben - gespeichert wird erst,
    // wenn jemand die Stufe bewusst umstellt.
    if (legacyCoach === null) return 'coach'

    const migrated: DetailLevel = legacyCoach === 'false' ? 'normal' : 'coach'
    localStorage.setItem(STORAGE_KEY, migrated)
    localStorage.removeItem(LEGACY_COACH_KEY)
    localStorage.removeItem(LEGACY_COMPACT_KEY)
    return migrated
  } catch {
    // Private Mode oder Speicher voll - für diese Sitzung reicht der Standard.
    return 'coach'
  }
}

let level: DetailLevel = loadLevel()

const listeners = new Set<() => void>()

export function getDetailLevel(): DetailLevel {
  return level
}

/** Abo für React (useSyncExternalStore). */
export function subscribeDetailLevel(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setDetailLevel(next: DetailLevel): void {
  if (next === level) return
  level = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Siehe oben - der In-Memory-Zustand reicht für diese Sitzung.
  }
  listeners.forEach((l) => l())
}

export function useDetailLevel(): DetailLevel {
  return useSyncExternalStore(subscribeDetailLevel, getDetailLevel, getDetailLevel)
}

/** Anfänger-Ansicht: Zusätzliches wird komplett weggelassen, nicht nur eingeklappt. */
export function useSimpleMode(): boolean {
  return useDetailLevel() === 'einfach'
}

/** Coach-Ansicht: Detailfelder, Auswertungen und Bearbeiten-Modus der Pläne. */
export function useCoachMode(): boolean {
  return useDetailLevel() === 'coach'
}
