import { useSyncExternalStore } from 'react'

/*
 * PC-Ansicht: Ab 1024 px Breite (Tailwind `lg`) bekommt die App eine Seitenleiste und
 * mehrspaltige Seiten. Darunter - also auf jedem Handy - bleibt alles wie gehabt: Die
 * Klassen unten sind ohne `lg:` reine Spalten mit den bisherigen Abständen.
 */

/** Zwei Bereiche: am Handy untereinander, am PC nebeneinander. */
export const SPLIT = 'flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6'
/** Breite rechte Spalte, schmale linke (z. B. Werte links, Liste rechts). */
export const SPLIT_WIDE_RIGHT = 'flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-6'
/** Breite linke Spalte, schmale rechte (z. B. Plan links, Wochenvolumen rechts). */
export const SPLIT_WIDE_LEFT = 'flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-6'
/** Eine Spalte innerhalb von SPLIT. */
export const COL = 'flex min-w-0 flex-col gap-4'
/** Am Handy zuerst, am PC rechts - z. B. das Wochenvolumen neben dem Plan. */
export const COL_FIRST_RIGHT = 'flex min-w-0 flex-col gap-4 lg:sticky lg:top-0 lg:col-start-2 lg:row-start-1'
/** Gegenstück zu COL_FIRST_RIGHT: am Handy danach, am PC links. */
export const COL_SECOND_LEFT = 'flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1'

const QUERY = '(min-width: 1024px)'

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

/** true auf breiten Bildschirmen (PC), false auf dem Handy. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
