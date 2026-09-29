import { Lightbulb, X } from 'lucide-react'
import { setPrefs, usePrefs } from '../lib/prefs'

const HINTS: Record<string, { title: string; text: string }> = {
  dashboard: {
    title: 'Dein Überblick',
    text: 'Oben siehst du den Tag. Zahlen antippen springt in den passenden Bereich, der „+“-Knopf trägt schnell etwas ein. Karten sortierst du in den Einstellungen.',
  },
  tracking: {
    title: 'Tracking',
    text: 'Trag hier täglich dein Gewicht ein. Über dem Diagramm wählst du den Zeitraum, mit dem Finger über die Linie siehst du einzelne Werte.',
  },
  ernaehrung: {
    title: 'Ernährung',
    text: 'Im Log trägst du ein, was du isst – oben stehen die zuletzt verwendeten Lebensmittel. Oben wechselst du zwischen Log, Plan und Supplements.',
  },
  training: {
    title: 'Training',
    text: 'Starte einen Trainingstag, hak Sätze ab und nutze − und +. Die Spalte „Vorher“ zeigt das letzte Mal. Lange auf die Satznummer drücken markiert einen Aufwärmsatz.',
  },
}

/** Einmaliger Hinweis beim ersten Öffnen eines Reiters - abschaltbar in den Einstellungen. */
export default function TourHint({ id }: { id: keyof typeof HINTS }) {
  const prefs = usePrefs()
  const hint = HINTS[id]
  if (!prefs.tour || prefs.toursSeen.includes(id) || !hint) return null
  return (
    <div className="anim-pop flex gap-3 rounded-2xl border border-accent/30 bg-accent/10 p-3">
      <Lightbulb size={18} className="mt-0.5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">{hint.title}</p>
        <p className="text-xs text-muted">{hint.text}</p>
        <button type="button" onClick={() => setPrefs({ tour: false })} className="mt-1.5 text-xs text-accent">
          Keine Hinweise mehr zeigen
        </button>
      </div>
      <button type="button" aria-label="Hinweis schließen" onClick={() => setPrefs({ toursSeen: [...prefs.toursSeen, id] })} className="self-start text-muted">
        <X size={16} />
      </button>
    </div>
  )
}
