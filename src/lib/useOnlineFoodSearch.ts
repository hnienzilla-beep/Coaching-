import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { findExistingFood, foodFromOnline, searchOpenFoodFacts, type OnlineFood } from './openFoodFacts'

// Open Food Facts erlaubt nur rund zehn Suchen pro Minute und Gerät. Deshalb wird jede Suche
// für die Sitzung gemerkt (Zurück zur Suche, dasselbe Wort erneut) und erst nach einer
// Tipp-Pause abgeschickt. Schlägt sie fehl, gibt es genau einen automatischen Neuversuch.
const cache = new Map<string, OnlineFood[]>()
const DEBOUNCE_MS = 600
const RETRY_MS = 2500

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
}

/**
 * Online-Suche ab drei Zeichen, abgeschickt nach einer kurzen Tipp-Pause; ältere Anfragen
 * werden abgebrochen. Offline oder bei einem Fehler bleibt die Liste leer und `error` gesetzt
 * - die lokale Suche funktioniert davon unabhängig immer. `retry()` startet die Suche neu.
 */
export function useOnlineFoodSearch(query: string, enabled = true) {
  const [results, setResults] = useState<OnlineFood[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const q = query.trim()
  const key = q.toLowerCase()

  useEffect(() => {
    setError(false)
    if (!enabled || q.length < 3) {
      setResults([])
      setLoading(false)
      return
    }
    const cached = cache.get(key)
    if (cached) {
      setResults(cached)
      setLoading(false)
      return
    }
    setResults([])
    setLoading(true)
    const controller = new AbortController()
    const { signal } = controller

    async function run() {
      await wait(DEBOUNCE_MS, signal)
      try {
        return await searchOpenFoodFacts(q, signal)
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e
        await wait(RETRY_MS, signal)
        return await searchOpenFoodFacts(q, signal)
      }
    }

    run()
      .then((r) => {
        cache.set(key, r)
        setResults(r)
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== 'AbortError') setError(true)
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [q, key, enabled, attempt])

  return { results, loading, error, active: enabled && q.length >= 3, retry: () => setAttempt((n) => n + 1) }
}

/** Übernimmt einen Online-Treffer in die eigene Datenbank - oder nimmt den vorhandenen Eintrag. */
export async function importOnlineFood(online: OnlineFood): Promise<string> {
  const existing = findExistingFood(await db.foodItems.toArray(), online)
  if (existing) return existing.id
  const food = foodFromOnline(online)
  await db.foodItems.add(food)
  return food.id
}
