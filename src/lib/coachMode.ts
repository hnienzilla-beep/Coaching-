import { useEffect, useState } from 'react'

const STORAGE_KEY = 'coachMode'

export function getStoredCoachMode(): boolean {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === null ? true : raw === 'true'
}

export function useCoachMode(): [boolean, (value: boolean) => void] {
  const [coachMode, setCoachMode] = useState<boolean>(() => getStoredCoachMode())

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(coachMode))
  }, [coachMode])

  return [coachMode, setCoachMode]
}
