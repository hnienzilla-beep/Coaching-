import { useEffect, useRef, useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { ACCENT_COLORS, clearBackgroundPhoto, setBackgroundPhoto, sortAthletes } from '../db/queries'
import { applyAccentColor, getStoredOverviewAccent } from '../lib/accentColor'
import { DETAIL_LEVELS, setDetailLevel, useDetailLevel } from '../lib/detailLevel'
import { setLastAthleteId } from '../lib/lastAthlete'
import { useTheme } from '../lib/theme'
import { AccentSwatch } from '../components/ui'
import ObsidianSyncModal from '../features/obsidianSync/ObsidianSyncModal'
import type { Athlete } from '../models/types'

// Ernährung (Plan/Log/Supplements) und Training (Plan/Log) sind je ein Tab mit einem
// internen Umschalter auf der jeweiligen Seite selbst - dadurch bleiben nur 4
// Haupt-Tabs, die bequem in eine einzeilige Bottom-Navigation passen.
const TABS = [
  { to: '', label: 'Dashboard', end: true },
  { to: 'tracking', label: 'Tracking', end: false },
  { to: 'ernaehrung', label: 'Ernährung', end: false },
  { to: 'training', label: 'Training', end: false },
]

export default function AthleteLayout() {
  const { athleteId } = useParams()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const detailLevel = useDetailLevel()
  const [theme, setTheme] = useTheme()

  // `?? null` unterscheidet "lädt noch" (undefined) von "gibt es nicht" (null) - ohne das
  // blitzte der Fehlerzweig bei jedem Laden kurz auf.
  const athlete = useLiveQuery(
    async () => (athleteId ? ((await db.athletes.get(athleteId)) ?? null) : null),
    [athleteId],
  )
  const athletes = useLiveQuery(() => db.athletes.toArray(), [])
  const backgroundPhotoCount = useLiveQuery(() => db.backgroundPhoto.count(), [])

  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [athletePickerOpen, setAthletePickerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [obsidianSyncOpen, setObsidianSyncOpen] = useState(false)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const athletePickerRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)
  const backgroundPhotoInputRef = useRef<HTMLInputElement>(null)
  const mainRef = useRef<HTMLElement>(null)

  const sortedAthletes = sortAthletes(athletes ?? [])
  const canManageAthletes = detailLevel !== 'einfach'

  // Gescrollt wird im <main>, nicht im Dokument - den Scroll beim Reiterwechsel
  // zurücksetzen übernimmt der Router deshalb nicht mehr.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  // Merken, wo man war: Beim nächsten App-Start landet man wieder bei diesem Athleten.
  const loadedAthleteId = athlete?.id
  useEffect(() => {
    if (loadedAthleteId) setLastAthleteId(loadedAthleteId)
  }, [loadedAthleteId])

  // Beim Verlassen des Athleten zurück auf die Akzentfarbe der Übersicht - nicht einfach
  // entfernen, sonst ginge eine dort eingestellte Farbe verloren.
  useEffect(() => {
    if (!athlete?.accentColor) return
    applyAccentColor(athlete.accentColor)
    return () => applyAccentColor(getStoredOverviewAccent())
  }, [athlete?.accentColor])

  // Ein Handler für alle drei Klapplisten der Kopfzeile: Ein Klick daneben schließt die,
  // in der er nicht gelandet ist.
  useEffect(() => {
    if (!colorPickerOpen && !athletePickerOpen && !settingsOpen) return
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (!colorPickerRef.current?.contains(target)) setColorPickerOpen(false)
      if (!athletePickerRef.current?.contains(target)) setAthletePickerOpen(false)
      if (!settingsRef.current?.contains(target)) setSettingsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [colorPickerOpen, athletePickerOpen, settingsOpen])

  if (athlete === undefined) return null
  if (athlete === null) return <Navigate to="/" replace />

  return (
    <div className="mx-auto flex h-full max-w-md flex-col overflow-hidden">
      <header className="shrink-0 flex items-center gap-3 border-b border-border p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div ref={colorPickerRef} className="relative">
          <button
            type="button"
            onClick={() => setColorPickerOpen((v) => !v)}
            aria-label="Akzentfarbe ändern"
            className="h-3 w-3 rounded-full border border-border"
            style={{ background: athlete.accentColor }}
          />
          {colorPickerOpen && (
            <div className="absolute left-0 top-[calc(100%+0.5rem)] z-10 flex w-52 flex-wrap gap-2 rounded-xl border border-border bg-surface p-2 shadow-lg shadow-black/30">
              {ACCENT_COLORS.map((color) => (
                <AccentSwatch
                  key={color}
                  color={color}
                  selected={athlete.accentColor === color}
                  onSelect={(picked) => {
                    void db.athletes.update(athlete.id, { accentColor: picked })
                    setColorPickerOpen(false)
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Bei einem einzigen Athleten gibt es nichts auszuwählen - dann steht hier nur der
            Name, ohne Chevron und ohne Klappliste. Angelegt und verwaltet wird in dem Fall
            über das Zahnrad. */}
        {sortedAthletes.length > 1 ? (
          <div ref={athletePickerRef} className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setAthletePickerOpen((v) => !v)}
              aria-expanded={athletePickerOpen}
              className="flex w-full items-center gap-1.5 text-left"
            >
              <h1 className="truncate text-lg font-bold text-fg">{athlete.name}</h1>
              <span className={`shrink-0 text-muted transition-transform duration-200 ${athletePickerOpen ? 'rotate-180' : ''}`}>
                ▾
              </span>
            </button>
            {athletePickerOpen && (
              <div className="absolute left-0 top-[calc(100%+0.5rem)] z-10 flex w-56 flex-col gap-1 rounded-xl border border-border bg-surface p-2 shadow-lg shadow-black/30">
                {sortedAthletes.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setAthletePickerOpen(false)
                      // Bewusst aufs Dashboard und nicht auf den gerade offenen Reiter:
                      // Nach einem Athletenwechsel ist der Überblick der sinnvolle Einstieg.
                      if (a.id !== athlete.id) navigate(`/athlete/${a.id}`)
                    }}
                    aria-current={a.id === athlete.id}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2 ${
                      a.id === athlete.id ? 'text-fg' : 'text-muted'
                    }`}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-border" style={{ background: a.accentColor }} />
                    <span className="flex-1 truncate">{a.name}</span>
                    {a.id === athlete.id && <span className="shrink-0 text-accent">✓</span>}
                  </button>
                ))}
                {canManageAthletes && (
                  <>
                    <div className="my-1 border-t border-border" />
                    <Link
                      to="/athleten?neu=1"
                      onClick={() => setAthletePickerOpen(false)}
                      className="rounded-lg px-2 py-1.5 text-sm text-accent hover:bg-surface-2"
                    >
                      + Neuer Athlet
                    </Link>
                    <Link
                      to="/athleten"
                      onClick={() => setAthletePickerOpen(false)}
                      className="rounded-lg px-2 py-1.5 text-sm text-accent hover:bg-surface-2"
                    >
                      👥 Athleten verwalten
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-fg">{athlete.name}</h1>
        )}

        <div ref={settingsRef} className="relative shrink-0">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            aria-label="Einstellungen"
            className="rounded-lg border border-border bg-surface-2 p-2 text-sm leading-none text-fg"
          >
            ⚙️
          </button>
          {settingsOpen && (
            <div className="absolute right-0 top-[calc(100%+0.5rem)] z-10 flex w-52 flex-col gap-1 rounded-xl border border-border bg-surface p-2 shadow-lg shadow-black/30">
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="rounded-lg px-2 py-1.5 text-left text-sm text-fg hover:bg-surface-2"
              >
                {theme === 'dark' ? '☀️ Hell-Modus' : '🌙 Dunkel-Modus'}
              </button>
              <div className="flex flex-col gap-1 px-2 py-1.5">
                <span className="text-sm text-fg">👁️ Ansicht</span>
                <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
                  {DETAIL_LEVELS.map((l) => (
                    <button
                      key={l.key}
                      onClick={() => setDetailLevel(l.key)}
                      aria-pressed={detailLevel === l.key}
                      className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition ${
                        detailLevel === l.key ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg'
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-muted">{DETAIL_LEVELS.find((l) => l.key === detailLevel)?.hint}</span>
              </div>
              <button
                onClick={() => backgroundPhotoInputRef.current?.click()}
                className="rounded-lg px-2 py-1.5 text-left text-sm text-fg hover:bg-surface-2"
              >
                🖼️ Hintergrundbild wählen
              </button>
              {!!backgroundPhotoCount && (
                <button
                  onClick={async () => {
                    await clearBackgroundPhoto()
                    setSettingsOpen(false)
                  }}
                  className="rounded-lg px-2 py-1.5 text-left text-sm text-fg hover:bg-surface-2"
                >
                  🗑️ Hintergrundbild entfernen
                </button>
              )}
              <input
                ref={backgroundPhotoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) await setBackgroundPhoto(file)
                  e.target.value = ''
                  setSettingsOpen(false)
                }}
              />
              {/* Athletenverwaltung, Datenbanken und Sync sind Werkzeuge für Fortgeschrittene.
                  Die Ansichts-Auswahl darüber bleibt in jeder Stufe stehen - sonst gäbe es
                  keinen Weg zurück. */}
              {canManageAthletes && (
                <>
                  <div className="my-1 border-t border-border" />
                  <Link
                    to="/athleten"
                    onClick={() => setSettingsOpen(false)}
                    className="rounded-lg px-2 py-1.5 text-sm text-accent hover:bg-surface-2"
                  >
                    👥 Athleten verwalten
                  </Link>
                  <Link
                    to="/lebensmittel"
                    onClick={() => setSettingsOpen(false)}
                    className="rounded-lg px-2 py-1.5 text-sm text-accent hover:bg-surface-2"
                  >
                    Lebensmittel-DB
                  </Link>
                  <Link
                    to="/supplemente"
                    onClick={() => setSettingsOpen(false)}
                    className="rounded-lg px-2 py-1.5 text-sm text-accent hover:bg-surface-2"
                  >
                    Supplement-DB
                  </Link>
                  <Link
                    to="/uebungen"
                    onClick={() => setSettingsOpen(false)}
                    className="rounded-lg px-2 py-1.5 text-sm text-accent hover:bg-surface-2"
                  >
                    Trainings-DB
                  </Link>
                  <div className="my-1 border-t border-border" />
                  <button
                    onClick={() => {
                      setObsidianSyncOpen(true)
                      setSettingsOpen(false)
                    }}
                    className="rounded-lg px-2 py-1.5 text-left text-sm text-fg hover:bg-surface-2"
                  >
                    🔗 Obsidian-Sync
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto overscroll-contain p-4 pb-6">
        <Outlet context={{ athlete } satisfies { athlete: Athlete }} />
      </main>

      {/* Unten bewusst kein Safe-Area-Polster: Die 12px Eigenpolster der Reiter (`py-3`)
          reichen als Abstand zum Home-Indikator, dessen Oberkante rund 13px über der
          Unterkante liegt. Der volle Systemabstand (34px) schob die Beschriftungen
          spürbar vom Rand weg, ohne dass es etwas bringt. */}
      <nav className="grid shrink-0 grid-cols-4 gap-1.5 border-t border-border bg-bg/85 p-2 pb-1 backdrop-blur-xl">
        {TABS.map((tab) => (
          <NavLink
            key={tab.label}
            to={`/athlete/${athleteId}${tab.to ? `/${tab.to}` : ''}`}
            end={tab.end}
            className={({ isActive }) =>
              `truncate rounded-lg px-1 py-3 text-center text-[11px] font-medium leading-tight transition active:scale-95 ${
                isActive ? 'bg-accent text-accent-fg shadow-sm shadow-black/20' : 'text-muted hover:text-fg'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {obsidianSyncOpen && <ObsidianSyncModal onClose={() => setObsidianSyncOpen(false)} />}
    </div>
  )
}
