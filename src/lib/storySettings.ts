import { useEffect, useState } from 'react'

/** Alle Folien, die die Story kennt - in dieser Reihenfolge. Titel kommt immer. */
export const STORY_SLIDES = [
  { id: 'ernaehrung', label: 'Ernährung', hint: 'Ø Kalorien, Tage im Ziel, Protein' },
  { id: 'kcalVerlauf', label: 'Kalorien-Verlauf', hint: 'Balken je Tag gegen die Vorgabe' },
  { id: 'makros', label: 'Makro-Verteilung', hint: 'Ring mit Protein/Carbs/Fett' },
  { id: 'gewicht', label: 'Gewicht', hint: 'Kurve und Veränderung' },
  { id: 'wasser', label: 'Wasser', hint: 'Ø Liter und Tage im Ziel' },
  { id: 'training', label: 'Training', hint: 'Einheiten, Sätze, Volumen' },
  { id: 'trainingszeit', label: 'Trainingszeit', hint: 'Summe und längste Einheit' },
  { id: 'heatmap', label: 'Muskel-Heatmap', hint: 'Die Figur des Zeitraums' },
  { id: 'rekorde', label: 'Neue Rekorde', hint: 'Bestleistungen nach geschätztem 1RM' },
  { id: 'topFood', label: 'Top-Lebensmittel', hint: 'Wovon du die größte Menge gegessen hast' },
  { id: 'serien', label: 'Serien', hint: 'Tage in Folge geloggt' },
  { id: 'vergleich', label: 'Vergleich', hint: 'Zur Vorwoche bzw. zum Vormonat' },
  { id: 'prognose', label: 'Zielprognose', hint: 'Wann du dein Zielgewicht erreichst (Trend der letzten 3 Wochen)' },
  { id: 'masse', label: 'Körpermaße', hint: 'Veränderung von Bauch, Arm …' },
  { id: 'highlights', label: 'Highlights', hint: 'Schwerster Satz, bester Tag' },
  { id: 'tipps', label: 'Coach-Tipps', hint: '1–3 Tipps für die nächste Zeit' },
] as const
export type StorySlideId = (typeof STORY_SLIDES)[number]['id']

const KEY = 'coach.storySlides.disabled'
const EVENT = 'coach:story-settings'

function read(): StorySlideId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(raw) ? (raw.filter((x) => typeof x === 'string') as StorySlideId[]) : []
  } catch {
    return []
  }
}

/** Ausgeschaltete Folien (geräteweit). Neue Folientypen sind damit automatisch an. */
export function useDisabledStorySlides(): [StorySlideId[], (id: StorySlideId, enabled: boolean) => void] {
  const [disabled, setDisabled] = useState(read)
  useEffect(() => {
    const update = () => setDisabled(read())
    window.addEventListener(EVENT, update)
    return () => window.removeEventListener(EVENT, update)
  }, [])
  function toggle(id: StorySlideId, enabled: boolean) {
    const next = enabled ? read().filter((x) => x !== id) : [...new Set([...read(), id])]
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // Ohne Speicher gilt die Auswahl nur bis zum Neuladen.
    }
    setDisabled(next)
    window.dispatchEvent(new Event(EVENT))
  }
  return [disabled, toggle]
}
