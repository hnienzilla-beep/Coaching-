import { useRef, useState, type ReactNode } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, ChevronRight, Database, Dumbbell, Image, Link2, Pill, Trash2, Users, Utensils } from 'lucide-react'
import { db } from '../db/db'
import { clearBackgroundPhoto, setBackgroundPhoto } from '../db/queries'
import { applyAccentColor } from '../lib/accentColor'
import { DASHBOARD_CARDS, useHiddenDashboardCards } from '../lib/dashboardCards'
import { DETAIL_LEVELS, setDetailLevel, useDetailLevel } from '../lib/detailLevel'
import { useTheme, type Theme } from '../lib/theme'
import ColorWheel from '../components/ColorWheel'
import StorySettingsSheet from '../components/StorySettingsSheet'
import SwitchList from '../components/SwitchList'
import { SegmentedControl } from '../components/ui'
import ObsidianSyncModal from '../features/obsidianSync/ObsidianSyncModal'
import type { Athlete } from '../models/types'

const THEMES: { key: Theme; label: string }[] = [
  { key: 'light', label: 'Hell' },
  { key: 'dark', label: 'Dunkel' },
  { key: 'system', label: 'System' },
]

const APP_BUILD_LABEL = new Date(__APP_BUILD__).toLocaleString('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="reveal flex flex-col gap-1.5">
      <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted">{title}</h2>
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3">{children}</div>
    </section>
  )
}

function Row({ icon, label, onClick, to, danger }: { icon: ReactNode; label: string; onClick?: () => void; to?: string; danger?: boolean }) {
  const cls = `flex items-center gap-3 rounded-xl px-1 py-1.5 text-left text-sm transition active:scale-[0.98] ${danger ? 'text-danger' : 'text-fg'}`
  const inner = (
    <>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-accent">{icon}</span>
      <span className="flex-1">{label}</span>
      <ChevronRight size={16} className="text-muted" />
    </>
  )
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  )
}

/** Alle Einstellungen auf einer Seite, gruppiert - ersetzt das frühere Zahnrad-Menü. */
export default function SettingsPage() {
  const { athlete } = useOutletContext<{ athlete: Athlete }>()
  const [theme, setTheme] = useTheme()
  const detailLevel = useDetailLevel()
  const [hiddenCards, toggleCard] = useHiddenDashboardCards()
  const [storyOpen, setStoryOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const photoInput = useRef<HTMLInputElement>(null)
  const photoCount = useLiveQuery(() => db.backgroundPhoto.count(), [])
  const canManage = detailLevel !== 'einfach'

  return (
    <div className="flex flex-col gap-5">
      <Group title="Darstellung">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-fg">Farbschema</span>
          <SegmentedControl options={THEMES} value={theme} onChange={setTheme} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-fg">Ansicht</span>
          <SegmentedControl options={DETAIL_LEVELS} value={detailLevel} onChange={setDetailLevel} />
          <span className="text-xs text-muted">{DETAIL_LEVELS.find((l) => l.key === detailLevel)?.hint}</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="self-start text-sm text-fg">Akzentfarbe</span>
          {/* Vorschau live beim Ziehen, gespeichert wird beim Loslassen. */}
          <ColorWheel
            value={athlete.accentColor}
            onChange={applyAccentColor}
            onCommit={(picked) => void db.athletes.update(athlete.id, { accentColor: picked })}
          />
        </div>
        <div className="flex flex-col">
          <Row icon={<Image size={16} />} label="Hintergrundbild wählen" onClick={() => photoInput.current?.click()} />
          {!!photoCount && <Row icon={<Trash2 size={16} />} label="Hintergrundbild entfernen" onClick={() => void clearBackgroundPhoto()} danger />}
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (file) await setBackgroundPhoto(file)
              e.target.value = ''
            }}
          />
        </div>
      </Group>

      <Group title="Dashboard-Karten">
        <SwitchList items={DASHBOARD_CARDS} isOn={(id) => !hiddenCards.includes(id)} onToggle={(id, on) => toggleCard(id, !on)} />
      </Group>

      <Group title="Rückblick">
        <Row icon={<BookOpen size={16} />} label="Folien der Wochen-Story" onClick={() => setStoryOpen(true)} />
      </Group>

      {/* Athletenverwaltung, Datenbanken und Sync sind Werkzeuge für Fortgeschrittene. */}
      {canManage && (
        <Group title="Verwaltung">
          <div className="flex flex-col">
            <Row icon={<Users size={16} />} label="Athleten verwalten" to="/athleten" />
            <Row icon={<Utensils size={16} />} label="Lebensmittel-Datenbank" to="/lebensmittel" />
            <Row icon={<Pill size={16} />} label="Supplement-Datenbank" to="/supplemente" />
            <Row icon={<Dumbbell size={16} />} label="Übungs-Datenbank" to="/uebungen" />
            <Row icon={<Link2 size={16} />} label="Obsidian-Sync" onClick={() => setSyncOpen(true)} />
          </div>
        </Group>
      )}

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted">
        <Database size={12} /> Version vom {APP_BUILD_LABEL}
      </p>

      <StorySettingsSheet open={storyOpen} onClose={() => setStoryOpen(false)} />
      {syncOpen && <ObsidianSyncModal onClose={() => setSyncOpen(false)} />}
    </div>
  )
}
