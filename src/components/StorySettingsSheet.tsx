import { STORY_SLIDES, useDisabledStorySlides } from '../lib/storySettings'
import Sheet from './Sheet'
import SwitchList from './SwitchList'
import { Button } from './ui'

/** Welche Folien Wochen- und Monats-Story zeigen - aus den Einstellungen. */
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
      <SwitchList items={STORY_SLIDES} isOn={(id) => !disabled.includes(id)} onToggle={toggle} />
    </Sheet>
  )
}
