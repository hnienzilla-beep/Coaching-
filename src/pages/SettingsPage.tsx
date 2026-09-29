import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bell,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Dumbbell,
  FileSpreadsheet,
  HardDrive,
  Image,
  Info,
  LayoutDashboard,
  LineChart,
  Link2,
  Navigation,
  Palette,
  Pill,
  Ruler,
  Search,
  Trash2,
  Upload,
  Users,
  Utensils,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { db, exportAllData, importSelectedAthletes } from '../db/db'
import { dedupeAfterImport } from '../db/dedupe'
import { clearBackgroundPhoto, setBackgroundPhoto, todayIso } from '../db/queries'
import { applyAccentColor } from '../lib/accentColor'
import { CHANGELOG } from '../lib/changelog'
import { dailyCsv, nutritionCsv, trainingCsv } from '../lib/csvExport'
import { DASHBOARD_CARDS } from '../lib/dashboardCards'
import { DETAIL_LEVELS, setDetailLevel, useDetailLevel } from '../lib/detailLevel'
import { resetPrefs, setPref, setPrefs, toggleInList, usePrefs, type Prefs, type TabKey } from '../lib/prefs'
import { requestNotificationPermission } from '../lib/reminders'
import { REST_DURATIONS, getRestTimer, setRestDuration, subscribeRestTimer } from '../lib/restTimer'
import {
  HINTS,
  NUTRITION_CARDS,
  SECTIONS,
  SUB_VIEWS,
  TAB_LABELS,
  TRACKING_CARDS,
  TRACKING_VALUES,
  TRAINING_CARDS,
  type SectionKey,
} from '../lib/settingsMeta'
import { shareOrDownloadFile } from '../lib/share'
import { STORY_SLIDES, useDisabledStorySlides } from '../lib/storySettings'
import { useTheme, type Theme } from '../lib/theme'
import ColorWheel from '../components/ColorWheel'
import { Choice, Group, ResetButton, SortableToggles, Toggle } from '../components/SettingsControls'
import { Input } from '../components/ui'
import ObsidianSyncModal from '../features/obsidianSync/ObsidianSyncModal'
import type { Athlete } from '../models/types'

const ICONS: Record<SectionKey, LucideIcon> = {
  darstellung: Palette,
  navigation: Navigation,
  dashboard: LayoutDashboard,
  tracking: LineChart,
  ernaehrung: Utensils,
  training: Dumbbell,
  einheiten: Ruler,
  story: BookOpen,
  erinnerungen: Bell,
  daten: HardDrive,
  verwaltung: Wrench,
  info: Info,
}

const APP_BUILD_LABEL = new Date(__APP_BUILD__).toLocaleString('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

type Ctx = { athlete: Athlete }

/** Einstellungen: Startliste mit Suche, jeder Bereich als eigene Unterseite (wie iOS). */
export default function SettingsPage() {
  const { section } = useParams()
  const current = SECTIONS.find((s) => s.key === section)
  return current ? <SectionPage section={current.key} /> : <SettingsHome />
}

function SettingsHome() {
  const { athlete } = useOutletContext<Ctx>()
  const detailLevel = useDetailLevel()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const visible = SECTIONS.filter((s) => s.key !== 'verwaltung' || detailLevel !== 'einfach')
  const matches = q
    ? visible.filter((s) => s.label.toLowerCase().includes(q) || s.hint.toLowerCase().includes(q) || s.search.some((w) => w.includes(q)))
    : visible

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
        <Search size={16} className="shrink-0 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Einstellung suchen …"
          aria-label="Einstellungen durchsuchen"
          className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Suche leeren" className="text-muted">
            <X size={16} />
          </button>
        )}
      </label>

      <Group>
        {matches.map((s) => {
          const Icon = ICONS[s.key]
          return (
            <Link key={s.key} to={`/athlete/${athlete.id}/einstellungen/${s.key}`} className="flex items-center gap-3 px-3 py-2.5 transition active:bg-surface-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
                <Icon size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-fg">{s.label}</span>
                <span className="block truncate text-xs text-muted">{s.hint}</span>
              </span>
              <ChevronRight size={16} className="text-muted" />
            </Link>
          )
        })}
        {matches.length === 0 && <p className="px-3 py-4 text-center text-sm text-muted">Keine Einstellung gefunden.</p>}
      </Group>

      <ResetButton
        label="Alle Einstellungen zurücksetzen"
        onReset={() => {
          resetPrefs()
          for (const key of ['coach.storySlides.disabled', 'coach.dashboard.hidden', 'coach.tracking.range']) {
            try {
              localStorage.removeItem(key)
            } catch {
              // egal
            }
          }
          window.dispatchEvent(new Event('coach:story-settings'))
        }}
      />
      <p className="text-center text-[11px] text-muted">Version vom {APP_BUILD_LABEL}</p>
    </div>
  )
}

function SectionPage({ section }: { section: SectionKey }) {
  const navigate = useNavigate()
  const { athlete } = useOutletContext<Ctx>()
  const meta = SECTIONS.find((s) => s.key === section)!
  const body: Record<SectionKey, ReactNode> = {
    darstellung: <Darstellung athlete={athlete} />,
    navigation: <NavigationSection />,
    dashboard: <DashboardSection />,
    tracking: <TrackingSection />,
    ernaehrung: <ErnaehrungSection />,
    training: <TrainingSection />,
    einheiten: <EinheitenSection />,
    story: <StorySection />,
    erinnerungen: <ErinnerungenSection />,
    daten: <DatenSection athlete={athlete} />,
    verwaltung: <VerwaltungSection />,
    info: <InfoSection />,
  }
  return (
    <div className="flex flex-col gap-5">
      <button type="button" onClick={() => navigate(`/athlete/${athlete.id}/einstellungen`)} className="-ml-1 -mb-2 flex items-center gap-0.5 self-start text-sm text-accent">
        <ChevronLeft size={18} /> Einstellungen
      </button>
      {body[section]}
      {meta.prefs.length > 0 && <ResetButton onReset={() => resetPrefs(meta.prefs)} />}
    </div>
  )
}

/* ------------------------------------------------------------------------------------------ */

const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
  { value: 'system', label: 'System' },
]

function Darstellung({ athlete }: { athlete: Athlete }) {
  const prefs = usePrefs()
  const [theme, setTheme] = useTheme()
  const detailLevel = useDetailLevel()
  const photoInput = useRef<HTMLInputElement>(null)
  const photoCount = useLiveQuery(() => db.backgroundPhoto.count(), [])
  return (
    <>
      <Group title="Farben">
        <Choice label="Farbschema" options={THEMES} value={theme} onChange={setTheme} />
        <Choice label="Kontrast" options={[{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'Hoch' }]} value={prefs.contrast} onChange={(v) => setPref('contrast', v)} />
        <div className="flex flex-col items-center gap-2 px-3 py-3">
          <span className="self-start text-sm text-fg">Akzentfarbe</span>
          {/* Vorschau live beim Ziehen, gespeichert wird beim Loslassen. */}
          <ColorWheel value={athlete.accentColor} onChange={applyAccentColor} onCommit={(picked) => void db.athletes.update(athlete.id, { accentColor: picked })} />
        </div>
        <button type="button" onClick={() => photoInput.current?.click()} className="flex items-center gap-3 px-3 py-2.5 text-left text-sm text-fg">
          <Image size={16} className="text-accent" /> Hintergrundbild wählen
        </button>
        {!!photoCount && (
          <button type="button" onClick={() => void clearBackgroundPhoto()} className="flex items-center gap-3 px-3 py-2.5 text-left text-sm text-danger">
            <Trash2 size={16} /> Hintergrundbild entfernen
          </button>
        )}
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
      </Group>

      <Group title="Umfang" footer={DETAIL_LEVELS.find((l) => l.key === detailLevel)?.hint}>
        <Choice label="Ansicht" options={DETAIL_LEVELS.map((l) => ({ value: l.key, label: l.label }))} value={detailLevel} onChange={setDetailLevel} />
      </Group>

      <Group title="Text & Bewegung">
        <Choice label="Schriftgröße" options={[{ value: 's', label: 'Klein' }, { value: 'm', label: 'Normal' }, { value: 'l', label: 'Groß' }]} value={prefs.fontSize} onChange={(v) => setPref('fontSize', v)} />
        <Choice
          label="Animationen"
          options={[{ value: 'full', label: 'Voll' }, { value: 'reduced', label: 'Reduziert' }, { value: 'off', label: 'Aus' }]}
          value={prefs.animations}
          onChange={(v) => setPref('animations', v)}
        />
        <Toggle label="Vibration" hint="Kurzes Feedback beim Tippen (nicht auf dem iPhone)" on={prefs.haptics} onChange={(v) => setPref('haptics', v)} />
        <Toggle label="Konfetti" hint="Wenn ein Tagesziel erreicht ist" on={prefs.confetti} onChange={(v) => setPref('confetti', v)} />
      </Group>

      <Group title="Hilfe">
        <Toggle label="Einführungs-Hinweise" hint="Kurze Erklärung beim ersten Öffnen jedes Reiters" on={prefs.tour} onChange={(v) => setPref('tour', v)} />
        <button type="button" onClick={() => setPrefs({ tour: true, toursSeen: [] })} className="px-3 py-2.5 text-left text-sm text-accent">
          Hinweise erneut zeigen
        </button>
      </Group>
    </>
  )
}

function NavigationSection() {
  const prefs = usePrefs()
  const tabItems = (Object.keys(TAB_LABELS) as TabKey[]).map((id) => ({ id, label: TAB_LABELS[id] }))
  const visibleTabs = prefs.tabOrder.filter((t) => !prefs.hiddenTabs.includes(t))
  return (
    <>
      <Group title="Reiter" footer="Zum Sortieren am Griff ziehen. Mindestens ein Reiter bleibt sichtbar.">
        <SortableToggles
          items={tabItems}
          order={prefs.tabOrder}
          hidden={prefs.hiddenTabs}
          onOrder={(order) => setPref('tabOrder', order)}
          onToggle={(id, on) => {
            if (!on && visibleTabs.length <= 1) return
            toggleInList('hiddenTabs', id, !on)
            if (!on && prefs.startTab === id) setPref('startTab', visibleTabs.find((t) => t !== id) ?? 'dashboard')
          }}
        />
      </Group>
      <Group title="Beim Öffnen">
        <Choice label="Startseite" options={visibleTabs.map((t) => ({ value: t, label: TAB_LABELS[t] }))} value={prefs.startTab} onChange={(v) => setPref('startTab', v)} />
      </Group>
      {(['ernaehrung', 'training'] as const).map((tab) => {
        const views = SUB_VIEWS[tab]
        const shown = views.filter((v) => !prefs.hiddenSubViews.includes(`${tab}:${v.key}`))
        return (
          <Group key={tab} title={`Unteransichten ${TAB_LABELS[tab]}`}>
            {views.map((v) => (
              <Toggle
                key={v.key}
                label={v.label}
                on={!prefs.hiddenSubViews.includes(`${tab}:${v.key}`)}
                onChange={(on) => {
                  if (!on && shown.length <= 1) return
                  toggleInList('hiddenSubViews', `${tab}:${v.key}`, !on)
                  if (!on && prefs.startSubView[tab] === v.key)
                    setPref('startSubView', { ...prefs.startSubView, [tab]: shown.find((x) => x.key !== v.key)?.key ?? 'log' })
                }}
              />
            ))}
            <Choice
              label="Startet mit"
              options={shown.map((v) => ({ value: v.key, label: v.label }))}
              value={prefs.startSubView[tab] ?? 'log'}
              onChange={(v) => setPref('startSubView', { ...prefs.startSubView, [tab]: v })}
            />
          </Group>
        )
      })}
      <Group title="Knopf">
        <Toggle label="„+“-Knopf" hint="Schnell Essen, Gewicht, Wasser, Training eintragen" on={prefs.quickAddButton} onChange={(v) => setPref('quickAddButton', v)} />
      </Group>
    </>
  )
}

function DashboardSection() {
  const prefs = usePrefs()
  return (
    <>
      <Group title="Karten" footer="Zum Sortieren am Griff ziehen. „Heute“ steht immer oben.">
        <SortableToggles
          items={DASHBOARD_CARDS}
          order={prefs.dashboardOrder}
          hidden={prefs.dashboardHidden}
          onOrder={(order) => setPref('dashboardOrder', order)}
          onToggle={(id, on) => toggleInList('dashboardHidden', id, !on)}
        />
      </Group>
      <Group title="Nächster Schritt – welche Hinweise">
        {HINTS.map((h) => (
          <Toggle key={h.id} label={h.label} hint={h.hint} on={!prefs.hiddenHints.includes(h.id)} onChange={(on) => toggleInList('hiddenHints', h.id, !on)} />
        ))}
      </Group>
      <Group title="Wasser-Knöpfe" footer="Mengen in ml – gelten im Ernährungslog und im „+“-Menü.">
        <div className="flex gap-2 px-3 py-2.5">
          {prefs.waterAmounts.map((ml, i) => (
            <Input
              key={i}
              type="number"
              inputMode="numeric"
              value={ml}
              onChange={(e) => {
                const next = [...prefs.waterAmounts]
                next[i] = Math.max(0, Math.min(2000, Number(e.target.value) || 0))
                setPref('waterAmounts', next)
              }}
              aria-label={`Wasser-Knopf ${i + 1} in ml`}
              className="text-center"
            />
          ))}
        </div>
      </Group>
    </>
  )
}

function TrackingSection() {
  const prefs = usePrefs()
  return (
    <>
      <Group title="Erfasste Werte" footer="Gewicht wird immer erfasst.">
        {TRACKING_VALUES.map((v) => (
          <Toggle key={v.id} label={v.label} hint={v.hint} on={prefs.trackingValues.includes(v.id)} onChange={(on) => toggleInList('trackingValues', v.id, on)} />
        ))}
      </Group>
      <Group title="Diagramme">
        <Choice
          label="Standard-Zeitraum"
          options={[{ value: '2w', label: '2W' }, { value: '1m', label: '1M' }, { value: '3m', label: '3M' }, { value: 'all', label: 'Alle' }]}
          value={prefs.trackingRange}
          onChange={(v) => setPref('trackingRange', v)}
        />
      </Group>
      <Group title="Karten">
        {TRACKING_CARDS.map((c) => (
          <Toggle key={c.id} label={c.label} hint={c.hint} on={!prefs.trackingHidden.includes(c.id)} onChange={(on) => toggleInList('trackingHidden', c.id, !on)} />
        ))}
      </Group>
    </>
  )
}

function ErnaehrungSection() {
  const prefs = usePrefs()
  const enabledCount = prefs.meals.filter((m) => m.enabled).length
  function updateMeal(slot: string, patch: Partial<Prefs['meals'][number]>) {
    setPref(
      'meals',
      prefs.meals.map((m) => (m.slot === slot ? { ...m, ...patch } : m)),
    )
  }
  return (
    <>
      <Group title="Mahlzeiten" footer="Bis zu 8 Mahlzeiten, frei benennbar. Einträge ausgeschalteter Mahlzeiten bleiben erhalten.">
        {prefs.meals.map((m) => (
          <div key={m.slot} className="flex items-center gap-2 px-3 py-2">
            <input
              type="checkbox"
              checked={m.enabled}
              onChange={(e) => (e.target.checked || enabledCount > 1) && updateMeal(m.slot, { enabled: e.target.checked })}
              aria-label={`${m.name} anzeigen`}
              className="h-5 w-5 shrink-0 accent-[var(--color-accent)]"
            />
            <Input
              value={m.name}
              onChange={(e) => updateMeal(m.slot, { name: e.target.value })}
              onBlur={(e) => !e.target.value.trim() && updateMeal(m.slot, { name: m.slot })}
              aria-label={`Name für ${m.slot}`}
              className={m.enabled ? '' : 'opacity-50'}
            />
          </div>
        ))}
      </Group>
      <Group title="Eingabe">
        <Choice label="Gramm-Schritt der ± Knöpfe" options={[{ value: 5, label: '5 g' }, { value: 10, label: '10 g' }, { value: 25, label: '25 g' }]} value={prefs.gramStep} onChange={(v) => setPref('gramStep', v)} />
        <Choice
          label="Kalorien-Toleranz"
          hint="Wie weit ein Tag noch als „im Ziel“ gilt"
          options={[50, 100, 150, 200].map((v) => ({ value: v, label: `±${v}` }))}
          value={prefs.kcalTolerance}
          onChange={(v) => setPref('kcalTolerance', v)}
        />
      </Group>
      <Group title="Karten im Log">
        {NUTRITION_CARDS.map((c) => (
          <Toggle key={c.id} label={c.label} hint={c.hint} on={!prefs.nutritionHidden.includes(c.id)} onChange={(on) => toggleInList('nutritionHidden', c.id, !on)} />
        ))}
      </Group>
    </>
  )
}

function TrainingSection() {
  const prefs = usePrefs()
  const rest = useSyncExternalStore(subscribeRestTimer, getRestTimer)
  return (
    <>
      <Group title="Pausen-Timer">
        <Choice
          label="Standard-Pause"
          options={REST_DURATIONS.map((s) => ({ value: s, label: s >= 60 ? `${s / 60}${s % 60 ? ',5' : ''} min` : `${s} s` }))}
          value={rest.duration}
          onChange={setRestDuration}
        />
      </Group>
      <Group title="Satz-Eingabe">
        <Toggle label="RPE-Spalte" hint="Gefühlte Anstrengung je Satz" on={prefs.showRpe} onChange={(v) => setPref('showRpe', v)} />
      </Group>
      <Group title="Karten im Log">
        {TRAINING_CARDS.map((c) => (
          <Toggle key={c.id} label={c.label} hint={c.hint} on={!prefs.trainingHidden.includes(c.id)} onChange={(on) => toggleInList('trainingHidden', c.id, !on)} />
        ))}
      </Group>
    </>
  )
}

function EinheitenSection() {
  const prefs = usePrefs()
  return (
    <Group title="Einheiten" footer="Gespeichert wird immer metrisch – umgestellt wird nur die Anzeige.">
      <Choice label="Gewicht" options={[{ value: 'kg', label: 'kg' }, { value: 'lbs', label: 'lbs' }]} value={prefs.weightUnit} onChange={(v) => setPref('weightUnit', v)} />
      <Choice label="Länge (Maße)" options={[{ value: 'cm', label: 'cm' }, { value: 'in', label: 'inch' }]} value={prefs.lengthUnit} onChange={(v) => setPref('lengthUnit', v)} />
      <Choice label="Flüssigkeit" options={[{ value: 'ml', label: 'ml' }, { value: 'oz', label: 'oz' }]} value={prefs.volumeUnit} onChange={(v) => setPref('volumeUnit', v)} />
    </Group>
  )
}

function StorySection() {
  const prefs = usePrefs()
  const [disabled, toggle] = useDisabledStorySlides()
  return (
    <>
      <Group>
        <Toggle label="Montags automatisch öffnen" hint="Der Wochenrückblick startet von selbst" on={prefs.storyAutoOpen} onChange={(v) => setPref('storyAutoOpen', v)} />
      </Group>
      <Group title="Folien" footer="Folien ohne Daten werden automatisch übersprungen.">
        {STORY_SLIDES.map((s) => (
          <Toggle key={s.id} label={s.label} hint={s.hint} on={!disabled.includes(s.id)} onChange={(on) => toggle(s.id, on)} />
        ))}
      </Group>
    </>
  )
}

function ErinnerungenSection() {
  const prefs = usePrefs()
  const r = prefs.reminders
  const [permission, setPermission] = useState<string>(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  const set = (patch: Partial<Prefs['reminders']>) => setPref('reminders', { ...r, ...patch })
  async function enable(apply: () => void) {
    const p = await requestNotificationPermission()
    setPermission(p)
    apply()
  }
  return (
    <>
      {permission !== 'granted' && (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
          {permission === 'unsupported'
            ? 'Dieser Browser unterstützt keine Benachrichtigungen. Auf dem iPhone: App zum Home-Bildschirm hinzufügen.'
            : permission === 'denied'
              ? 'Benachrichtigungen sind blockiert – in den Geräte-Einstellungen erlauben.'
              : 'Beim Einschalten fragt die App einmal nach der Erlaubnis für Benachrichtigungen.'}
        </p>
      )}
      <Group title="Wiegen" footer="Nur wenn heute noch kein Gewicht eingetragen ist.">
        <Toggle label="Morgens ans Wiegen erinnern" on={r.weigh.on} onChange={(on) => void enable(() => set({ weigh: { ...r.weigh, on } }))} />
        {r.weigh.on && <TimeRow label="Uhrzeit" value={r.weigh.time} onChange={(time) => set({ weigh: { ...r.weigh, time } })} />}
      </Group>
      <Group title="Essen" footer="Nur wenn bis dahin weniger als 800 kcal geloggt sind.">
        <Toggle label="Ans Eintragen erinnern" on={r.food.on} onChange={(on) => void enable(() => set({ food: { ...r.food, on } }))} />
        {r.food.on && <TimeRow label="Uhrzeit" value={r.food.time} onChange={(time) => set({ food: { ...r.food, time } })} />}
      </Group>
      <Group title="Wasser" footer="Zwischen 8 und 21 Uhr.">
        <Toggle label="Ans Trinken erinnern" on={r.water.on} onChange={(on) => void enable(() => set({ water: { ...r.water, on } }))} />
        {r.water.on && (
          <Choice label="Alle" options={[1, 2, 3, 4].map((h) => ({ value: h, label: `${h} h` }))} value={r.water.everyHours} onChange={(everyHours) => set({ water: { ...r.water, everyHours } })} />
        )}
      </Group>
      <p className="px-1 text-[11px] text-muted">Erinnerungen kommen, solange die App geöffnet oder im Hintergrund ist.</p>
    </>
  )
}

function TimeRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm text-fg">
      {label}
      <input type="time" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm text-fg" />
    </label>
  )
}

function DatenSection({ athlete }: { athlete: Athlete }) {
  const importInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  async function exportBackup() {
    const json = await exportAllData()
    await shareOrDownloadFile(new File([json], `bodybuilding-coach-backup-${todayIso()}.json`, { type: 'application/json' }))
  }
  async function importBackup(file: File | undefined) {
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as { data?: { athletes?: Athlete[] } }
      const athletes = parsed.data?.athletes ?? []
      if (athletes.length === 0) throw new Error('leer')
      const names = athletes.map((a) => a.name).join(', ')
      if (!window.confirm(`Backup mit ${athletes.length} Athlet${athletes.length === 1 ? '' : 'en'} importieren (${names})? Vorhandene Daten mit gleicher ID werden überschrieben.`)) return
      setBusy(true)
      await importSelectedAthletes(text, athletes.map((a) => a.id))
      await dedupeAfterImport()
      alert('Import abgeschlossen.')
    } catch {
      alert('Import fehlgeschlagen. Ist die Datei ein gültiges Backup?')
    } finally {
      setBusy(false)
    }
  }
  async function csv(kind: 'tage' | 'ernaehrung' | 'training') {
    const text = kind === 'tage' ? await dailyCsv(athlete.id) : kind === 'ernaehrung' ? await nutritionCsv(athlete.id) : await trainingCsv(athlete.id)
    const name = { tage: 'Tageswerte', ernaehrung: 'Ernaehrung', training: 'Training' }[kind]
    await shareOrDownloadFile(new File([text], `${name}-${athlete.name}-${todayIso()}.csv`, { type: 'text/csv' }))
  }
  const row = 'flex items-center gap-3 px-3 py-2.5 text-left text-sm text-fg transition active:bg-surface-2 disabled:opacity-50'
  return (
    <>
      <Group title="Backup" footer="Sichert alle Athleten und Daten als eine Datei.">
        <button type="button" className={row} onClick={() => void exportBackup()}>
          <Download size={16} className="text-accent" /> Backup exportieren
        </button>
        <button type="button" className={row} disabled={busy} onClick={() => importInput.current?.click()}>
          <Upload size={16} className="text-accent" /> {busy ? 'Importiere …' : 'Backup importieren'}
        </button>
        <input
          ref={importInput}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            void importBackup(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </Group>
      <Group title={`CSV-Export für ${athlete.name}`} footer="Als Tabelle für Excel oder Numbers.">
        <button type="button" className={row} onClick={() => void csv('tage')}>
          <FileSpreadsheet size={16} className="text-accent" /> Tageswerte (Gewicht, KFA, Maße …)
        </button>
        <button type="button" className={row} onClick={() => void csv('ernaehrung')}>
          <FileSpreadsheet size={16} className="text-accent" /> Ernährung (alle Einträge)
        </button>
        <button type="button" className={row} onClick={() => void csv('training')}>
          <FileSpreadsheet size={16} className="text-accent" /> Training (alle Sätze)
        </button>
      </Group>
    </>
  )
}

function VerwaltungSection() {
  const [syncOpen, setSyncOpen] = useState(false)
  const row = 'flex items-center gap-3 px-3 py-2.5 text-left text-sm text-fg transition active:bg-surface-2'
  return (
    <>
      <Group>
        <Link to="/athleten" className={row}>
          <Users size={16} className="text-accent" /> <span className="flex-1">Athleten verwalten</span> <ChevronRight size={16} className="text-muted" />
        </Link>
        <Link to="/lebensmittel" className={row}>
          <Utensils size={16} className="text-accent" /> <span className="flex-1">Lebensmittel-Datenbank</span> <ChevronRight size={16} className="text-muted" />
        </Link>
        <Link to="/supplemente" className={row}>
          <Pill size={16} className="text-accent" /> <span className="flex-1">Supplement-Datenbank</span> <ChevronRight size={16} className="text-muted" />
        </Link>
        <Link to="/uebungen" className={row}>
          <Dumbbell size={16} className="text-accent" /> <span className="flex-1">Übungs-Datenbank</span> <ChevronRight size={16} className="text-muted" />
        </Link>
        <button type="button" onClick={() => setSyncOpen(true)} className={row}>
          <Link2 size={16} className="text-accent" /> <span className="flex-1">Obsidian-Sync</span> <ChevronRight size={16} className="text-muted" />
        </button>
      </Group>
      {syncOpen && <ObsidianSyncModal onClose={() => setSyncOpen(false)} />}
    </>
  )
}

function InfoSection() {
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const counts = useLiveQuery(async () => {
    const [entries, foods, logs, workouts] = await Promise.all([db.dailyEntries.count(), db.nutritionLogItems.count(), db.nutritionLogs.count(), db.workoutSets.count()])
    return { entries, foods, logs, workouts }
  }, [])
  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => setStorage({ usage: e.usage ?? 0, quota: e.quota ?? 0 }))
  }, [])
  const mb = (n: number) => (n / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })
  return (
    <>
      <Group title="Version">
        <p className="px-3 py-2.5 text-sm text-fg">Stand vom {APP_BUILD_LABEL}</p>
      </Group>
      <Group title="Speicher">
        <div className="flex flex-col gap-2 px-3 py-2.5">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-fg">
              <Database size={15} className="text-accent" /> Belegt
            </span>
            <span className="tabular-nums text-muted">{storage ? `${mb(storage.usage)} MB` : '…'}</span>
          </div>
          {storage && storage.quota > 0 && (
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(1, Math.min(100, (storage.usage / storage.quota) * 100))}%` }} />
            </div>
          )}
          {counts && (
            <p className="text-xs tabular-nums text-muted">
              {counts.entries} Tageseinträge · {counts.logs} Ernährungstage · {counts.foods} Essenseinträge · {counts.workouts} Trainingssätze
            </p>
          )}
        </div>
      </Group>
      {CHANGELOG.map((c, i) => (
        <Group key={c.title} title={i === 0 ? `Was ist neu – ${c.title}` : c.title}>
          <ul className="flex flex-col gap-1 px-3 py-2.5 text-sm text-fg">
            {c.items.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                {item}
              </li>
            ))}
          </ul>
        </Group>
      ))}
    </>
  )
}

