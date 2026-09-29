import { STORY_SLIDES, useDisabledStorySlides } from '../lib/storySettings'
import Sheet from './Sheet'
import { Button } from './ui'

/** Welche Folien Wochen- und Monats-Story zeigen - aus dem Zahnrad-Menü. */
export default function StorySettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [disabled, toggle] = useDisabledStorySlides()
  return (
    <Sheet
      open={open}
      title="Wochen-Story"
      onClose={onClose}
      tall
      footer={
        <Button variant="primary" onClick={onClose}>
          Fertig
        </Button>
      }
    >
      <p className="text-sm text-muted">
        Wähle, welche Folien dein Wochen- und Monatsrückblick zeigt. Folien ohne Daten werden automatisch übersprungen.
      </p>
      <div className="flex flex-col gap-1.5">
        {STORY_SLIDES.map((slide) => {
          const on = !disabled.includes(slide.id)
          return (
            <button
              key={slide.id}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => toggle(slide.id, !on)}
              className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-fg">{slide.label}</span>
                <span className="block truncate text-xs text-muted">{slide.hint}</span>
              </span>
              <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-border'}`}>
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
                />
              </span>
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
