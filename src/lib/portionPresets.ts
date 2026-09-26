import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'

/**
 * Schnellauswahl der Mengen beim Eintragen: zuerst, was man von einem Lebensmittel
 * üblicherweise isst (aus den bisherigen Einträgen gelernt), aufgefüllt mit den eigenen
 * Standard-Mengen. Die Standards gelten geräteweit (localStorage), wie die Detailstufe.
 */
export const DEFAULT_PORTIONS = [50, 100, 150, 200]
const STORAGE_KEY = 'coach.standardPortions'
const CHANGE_EVENT = 'coach:standard-portions'
const MAX_PORTIONS = 6
const MAX_LEARNED = 3
const HISTORY_LENGTH = 30

/** Bereinigt eine Mengenliste: nur positive Zahlen, ohne Doppelte, aufsteigend, höchstens sechs. */
export function normalizePortions(values: number[]): number[] {
  const clean = values.filter((v) => Number.isFinite(v) && v > 0).map((v) => Math.round(v * 10) / 10)
  return [...new Set(clean)].sort((a, b) => a - b).slice(0, MAX_PORTIONS)
}

/** Freitext wie "40, 60 80" → Mengenliste. Komma, Semikolon und Leerzeichen trennen. */
export function parsePortionList(text: string): number[] {
  return normalizePortions(text.split(/[\s,;]+/).filter(Boolean).map(Number))
}

export function loadStandardPortions(): number[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as unknown
    if (Array.isArray(stored)) {
      const portions = normalizePortions(stored.map(Number))
      if (portions.length > 0) return portions
    }
  } catch {
    // Kaputter oder gesperrter Speicher - dann gelten die Voreinstellungen.
  }
  return DEFAULT_PORTIONS
}

export function saveStandardPortions(values: number[]): void {
  const portions = normalizePortions(values)
  try {
    if (portions.length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(portions))
  } catch {
    // Ohne Speicher bleibt es bei dieser Sitzung.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/** Die eigenen Standard-Mengen - alle offenen Eingaben aktualisieren sich beim Ändern mit. */
export function useStandardPortions(): number[] {
  const [portions, setPortions] = useState(loadStandardPortions)
  useEffect(() => {
    const update = () => setPortions(loadStandardPortions())
    window.addEventListener(CHANGE_EVENT, update)
    return () => window.removeEventListener(CHANGE_EVENT, update)
  }, [])
  return portions
}

export type PortionSuggestion = {
  /** Aufsteigend sortiert - so stehen die Chips in einer vertrauten Reihenfolge. */
  presets: number[]
  /** Die am häufigsten eingetragene Menge - wird beim Auswählen vorbelegt. */
  preferred?: number
  /** Gelernte Mengen (aus den Einträgen), für eine kleine Markierung im Chip. */
  learned: number[]
}

/**
 * Mengen-Vorschläge aus der Historie (älteste zuerst): die häufigsten Mengen, bei Gleichstand
 * die zuletzt genutzte; höchstens drei gelernte, der Rest aus den Standards. Hat das
 * Lebensmittel eigene Mengen (`own`), gelten genau diese - vorbelegt wird dann die häufigste
 * Menge, falls sie darunter ist, sonst die erste.
 */
export function suggestPortions(history: number[], standards: number[], own?: number[]): PortionSuggestion {
  const total = Math.min(MAX_PORTIONS, Math.max(DEFAULT_PORTIONS.length, standards.length))
  const stats = new Map<number, { count: number; last: number }>()
  history.forEach((raw, i) => {
    if (!Number.isFinite(raw) || raw <= 0) return
    const grams = Math.round(raw * 10) / 10
    const s = stats.get(grams) ?? { count: 0, last: -1 }
    stats.set(grams, { count: s.count + 1, last: i })
  })
  const ranked = [...stats.entries()].sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last).map(([g]) => g)
  const custom = own ? normalizePortions(own) : []
  if (custom.length > 0) {
    const preferred = custom.includes(ranked[0]) ? ranked[0] : custom[0]
    return { presets: custom, preferred, learned: ranked.slice(0, MAX_LEARNED).filter((g) => custom.includes(g)) }
  }
  const learned = ranked.slice(0, MAX_LEARNED)
  const fill = standards.filter((s) => !learned.includes(s)).slice(0, Math.max(0, total - learned.length))
  return { presets: [...learned, ...fill].sort((a, b) => a - b), preferred: ranked[0], learned }
}

/**
 * Die zuletzt eingetragenen Mengen eines Lebensmittels - aus Log und Plänen, älteste zuerst.
 * `undefined`, solange die Abfrage noch läuft.
 */
export function useFoodPortionHistory(foodItemId: string | undefined): number[] | undefined {
  // Mit der Id zurückgegeben: Beim Wechsel des Lebensmittels liefert useLiveQuery kurz noch das
  // alte Ergebnis - das darf nicht als Historie des neuen durchgehen.
  const result = useLiveQuery(async () => {
    if (!foodItemId) return { foodItemId, grams: [] as number[] }
    const [logged, planned] = await Promise.all([
      db.nutritionLogItems.filter((i) => i.foodItemId === foodItemId).toArray(),
      db.planMeals.filter((m) => m.foodItemId === foodItemId).toArray(),
    ])
    return { foodItemId, grams: [...planned, ...logged].map((i) => i.grams).slice(-HISTORY_LENGTH) }
  }, [foodItemId])
  return result && result.foodItemId === foodItemId ? result.grams : undefined
}
