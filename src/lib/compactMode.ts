import { useEffect, useState } from 'react'

const STORAGE_KEY = 'compactMode'

export function getStoredCompactMode(): boolean {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === null ? false : raw === 'true'
}

export function useCompactMode(): [boolean, (value: boolean) => void] {
  const [compactMode, setCompactMode] = useState<boolean>(() => getStoredCompactMode())

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(compactMode))
  }, [compactMode])

  return [compactMode, setCompactMode]
}
