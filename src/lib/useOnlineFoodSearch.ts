import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { findExistingFood, foodFromOnline, searchOpenFoodFacts, type OnlineFood } from './openFoodFacts'

/**
 * Online-Suche mit Verzögerung: erst ab drei Zeichen und 400 ms nach dem letzten Tastendruck,
 * ältere Anfragen werden abgebrochen. Offline oder bei einem Fehler bleibt die Liste leer
 * und `error` gesetzt - die lokale Suche funktioniert davon unabhängig immer.
 */
export function useOnlineFoodSearch(query: string, enabled = true) {
  const [results, setResults] = useState<OnlineFood[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const q = query.trim()

  useEffect(() => {
    setResults([])
    setError(false)
    if (!enabled || q.length < 3) {
      setLoading(false)
      return
    }
    setLoading(true)
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchOpenFoodFacts(q, controller.signal)
        .then((r) => setResults(r))
        .catch((e: unknown) => {
          if ((e as Error).name !== 'AbortError') setError(true)
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 400)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q, enabled])

  return { results, loading, error, active: enabled && q.length >= 3 }
}

/** Übernimmt einen Online-Treffer in die eigene Datenbank - oder nimmt den vorhandenen Eintrag. */
export async function importOnlineFood(online: OnlineFood): Promise<string> {
  const existing = findExistingFood(await db.foodItems.toArray(), online)
  if (existing) return existing.id
  const food = foodFromOnline(online)
  await db.foodItems.add(food)
  return food.id
}
