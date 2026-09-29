import { useEffect, useState } from 'react'

/*
 * Kleine geräteweite Liste von Schlüsseln in localStorage (z.B. ausgeblendete Karten). Alle
 * Hooks mit demselben Schlüssel bleiben über ein Event synchron - eine Änderung auf der
 * Einstellungsseite wirkt sofort überall.
 */

const EVENT = 'coach:stored-set'

function read(key: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function useStoredSet<T extends string>(key: string): [T[], (id: T, included: boolean) => void] {
  const [items, setItems] = useState(() => read(key) as T[])
  useEffect(() => {
    const update = (e: Event) => {
      if ((e as CustomEvent<string>).detail === key) setItems(read(key) as T[])
    }
    window.addEventListener(EVENT, update)
    return () => window.removeEventListener(EVENT, update)
  }, [key])
  function toggle(id: T, included: boolean) {
    const current = read(key)
    const next = included ? [...new Set([...current, id])] : current.filter((x) => x !== id)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // Ohne Speicher gilt die Auswahl nur bis zum Neuladen.
    }
    setItems(next as T[])
    window.dispatchEvent(new CustomEvent(EVENT, { detail: key }))
  }
  return [items, toggle]
}
