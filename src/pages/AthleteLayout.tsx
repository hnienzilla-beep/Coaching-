import { useEffect, useRef, useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useParams, Link } from 'react-router-dom'
import { Apple, Check, ChevronDown, Dumbbell, LayoutDashboard, LineChart, Pill, Settings, UserPlus, Users, Utensils } from 'lucide-react'
import { useIsDesktop } from '../lib/desktop'
import { subViewQuery, swipeAnimationClass, useSwipeNavigation } from '../lib/swipeNavigation'
import { usePrefs, type TabKey } from '../lib/prefs'
import { startReminders } from '../lib/reminders'
import { SECTIONS } from '../lib/settingsMeta'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { sortAthletes, todayIso } from '../db/queries'
import { ageFromBirthDate } from '../lib/startPlan'
import { applyAccentColor, getStoredOverviewAccent } from '../lib/accentColor'
import FloatingRestTimer from '../components/FloatingRestTimer'
import QuickAddButton from '../components/QuickAddButton'
import { PageSkeleton, Skeleton } from '../components/ui'
import { useDetailLevel } from '../lib/detailLevel'
import { setLastAthleteId } from '../lib/lastAthlete'
import { accentForeground } from '../lib/theme'
import type { Athlete } from '../models/types'

// Ernährung (Plan/Log/Supplements) und Training (Plan/Log) sind je ein Tab mit einem
// internen Umschalter auf der jeweiligen Seite selbst - dadurch bleiben nur 4
// Haupt-Tabs, die bequem in eine einzeilige Bottom-Navigation passen.
// Reihenfolge und Sichtbarkeit kommen aus den Einstellungen (Navigation).
const ALL_TABS: Record<TabKey, { to: string; label: string; end: boolean; icon: typeof LayoutDashboard }> = {
  dashboard: { to: '', label: 'Dashboard', end: true, icon: LayoutDashboard },
  tracking: { to: 'tracking', label: 'Tracking', end: false, icon: LineChart },
  ernaehrung: { to: 'ernaehrung', label: 'Ernährung', end: false, icon: Utensils },
  training: { to: 'training', label: 'Training', end: false, icon: Dumbbell },
}

/** Abstand der schwebenden Navigation zum unteren Rand - über dem Home-Indikator. */
const NAV_BOTTOM = 'max(0.75rem, calc(env(safe-area-inset-bottom) - 0.5rem))'

export default function AthleteLayout() {
  const { athleteId } = useParams()
  const { pathname, state } = useLocation()
  const navigate = useNavigate()

  const detailLevel = useDetailLevel()
  const desktop = useIsDesktop()

  // `?? null` unterscheidet "lädt noch" (undefined) von "gibt es nicht" (null) - ohne das
  // blitzte der Fehlerzweig bei jedem Laden kurz auf.
  const athlete = useLiveQuery(
    async () => (athleteId ? ((await db.athletes.get(athleteId)) ?? null) : null),
    [athleteId],
  )

  const prefs = usePrefs()
  const tabOrder = prefs.tabOrder.filter((t) => !prefs.hiddenTabs.includes(t))
  const TABS = (tabOrder.length ? tabOrder : prefs.tabOrder).map((t) => ALL_TABS[t])

  // Wischen: einen Reiter weiter bzw. zurück (lib/swipeNavigation) - in der eingestellten Reihenfolge.
  const mainRef = useRef<HTMLElement>(null)
  const swipeContentRef = useRef<HTMLDivElement>(null)
  const activeTab = TABS.findIndex((t) => t.to === (pathname.split('/')[3] ?? ''))
  const swipeTarget = (direction: 'next' | 'prev') => (activeTab === -1 ? undefined : TABS[activeTab + (direction === 'next' ? 1 : -1)])
  useSwipeNavigation({
    area: mainRef,
    content: swipeContentRef,
    ready: !!athlete,
    targetLabel: (direction) => swipeTarget(direction)?.label ?? null,
    onSwipe: (direction) => {
      const target = swipeTarget(direction)
      if (!athleteId || !target) return
      const path = `/athlete/${athleteId}${target.to ? `/${target.to}${subViewQuery(target.to)}` : ''}`
      navigate(path, { state: { swipe: direction } })
    },
  })

  // Erinnerungen laufen für den offenen Athleten (lib/reminders).
  useEffect(() => (athleteId ? startReminders(athleteId) : undefined), [athleteId])
  // Beim Wischen gleitet die ganze Seite aus der Wischrichtung herein.
  const outerAnimation = swipeAnimationClass((state as { swipe?: unknown } | null)?.swipe)
  const athletes = useLiveQuery(() => db.athletes.toArray(), [])
  const [athletePickerOpen, setAthletePickerOpen] = useState(false)
  const [compact, setCompact] = useState(false)
  const athletePickerRef = useRef<HTMLDivElement>(null)

  const sortedAthletes = sortAthletes(athletes ?? [])
  const canManageAthletes = detailLevel !== 'einfach'

  // Gescrollt wird im <main>, nicht im Dokument - den Scroll beim Reiterwechsel
  // zurücksetzen übernimmt der Router deshalb nicht mehr.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
    setCompact(false)
  }, [pathname])

  // Mit Geburtsdatum bleibt das Alter von selbst aktuell (fließt in den Kalorienbedarf).
  useEffect(() => {
    if (!athlete?.birthDate) return
    const age = ageFromBirthDate(athlete.birthDate, todayIso())
    if (age > 0 && age !== athlete.age) void db.athletes.update(athlete.id, { age })
  }, [athlete?.id, athlete?.birthDate, athlete?.age])

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

  // Ein Klick neben die Athletenliste schließt sie.
  useEffect(() => {
    if (!athletePickerOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (!athletePickerRef.current?.contains(e.target as Node)) setAthletePickerOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [athletePickerOpen])

  if (athlete === undefined)
    return (
      <div className="mx-auto flex h-full max-w-md flex-col gap-4 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full!" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-8 w-40" />
        <PageSkeleton />
      </div>
    )
  if (athlete === null) return <Navigate to="/" replace />

  const segment = pathname.split('/')[3] ?? ''
  const onSettings = segment === 'einstellungen'
  const settingsSection = SECTIONS.find((s) => s.key === pathname.split('/')[4])
  const pageTitle = onSettings ? (settingsSection?.label ?? 'Einstellungen') : (Object.values(ALL_TABS).find((t) => t.to === segment)?.label ?? '')

  // PC (ab 1024 px): Seitenleiste links statt der Leiste unten, Inhalt breiter. Am Handy
  // greift keine der `lg:`-Klassen - dort bleibt alles wie gehabt.
  const sideLink = (active: boolean) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${active ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'}`

  return (
    <div className="relative mx-auto flex h-full max-w-md flex-col overflow-hidden lg:max-w-none lg:flex-row">
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-border bg-surface/50 px-3 pt-6 pb-4 lg:flex">
        <div className="mb-5 flex items-center gap-2.5 px-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-sm font-bold text-accent-fg">{initials(athlete.name)}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-fg">{athlete.name}</span>
            <span className="block truncate text-xs text-muted">{athlete.goal}</span>
          </span>
        </div>
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <NavLink
              key={tab.label}
              to={`/athlete/${athleteId}${tab.to ? `/${tab.to}${subViewQuery(tab.to)}` : ''}`}
              end={tab.end}
              className={({ isActive }) => sideLink(isActive)}
            >
              <Icon size={18} /> {tab.label}
            </NavLink>
          )
        })}
        <div className="my-3 border-t border-border" />
        <NavLink to={`/athlete/${athlete.id}/einstellungen`} className={({ isActive }) => sideLink(isActive)}>
          <Settings size={18} /> Einstellungen
        </NavLink>
        {canManageAthletes && (
          <>
            <span className="mt-4 px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Datenbanken</span>
            <Link to="/lebensmittel" className={sideLink(false)}>
              <Apple size={18} /> Lebensmittel
            </Link>
            <Link to="/uebungen" className={sideLink(false)}>
              <Dumbbell size={18} /> Übungen
            </Link>
            <Link to="/supplemente" className={sideLink(false)}>
              <Pill size={18} /> Supplemente
            </Link>
            <Link to="/athleten" className={`${sideLink(false)} mt-auto`}>
              <Users size={18} /> Athleten verwalten
            </Link>
          </>
        )}
      </aside>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header
        className={`shrink-0 border-b px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 transition-colors duration-300 ${
          compact ? 'border-border bg-bg/85 backdrop-blur-xl' : 'border-transparent'
        }`}
      >
        <div className="flex items-center gap-3 lg:mx-auto lg:w-full lg:max-w-6xl lg:px-4">
          <Link
            to={`/athlete/${athlete.id}/einstellungen`}
            aria-label="Einstellungen"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-fg transition active:scale-90 lg:hidden"
          >
            {initials(athlete.name)}
          </Link>

          {/* Bei einem einzigen Athleten gibt es nichts auszuwählen - dann steht hier nur der
              Name, ohne Chevron und ohne Klappliste. */}
          {sortedAthletes.length > 1 ? (
            <div ref={athletePickerRef} className="relative min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setAthletePickerOpen((v) => !v)}
                aria-expanded={athletePickerOpen}
                className="flex w-full items-center gap-1 text-left"
              >
                <span className="truncate text-base font-semibold text-fg">{athlete.name}</span>
                {compact && pageTitle && <span className="anim-pop shrink-0 truncate text-base text-muted">· {pageTitle}</span>}
                <ChevronDown
                  size={16}
                  className={`shrink-0 text-muted transition-transform duration-200 ${athletePickerOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {athletePickerOpen && (
                <div className="anim-pop absolute left-0 top-[calc(100%+0.5rem)] z-40 flex w-56 flex-col gap-1 rounded-xl border border-border bg-surface p-2 shadow-lg shadow-black/30">
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
                      <span
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold"
                        style={{ background: a.accentColor, color: accentForeground(a.accentColor) }}
                      >
                        {initials(a.name)}
                      </span>
                      <span className="flex-1 truncate">{a.name}</span>
                      {a.id === athlete.id && <Check size={16} className="shrink-0 text-accent" />}
                    </button>
                  ))}
                  {canManageAthletes && (
                    <>
                      <div className="my-1 border-t border-border" />
                      <Link
                        to="/dein-start"
                        onClick={() => setAthletePickerOpen(false)}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-accent hover:bg-surface-2"
                      >
                        <UserPlus size={16} /> Neuer Athlet
                      </Link>
                      <Link
                        to="/athleten"
                        onClick={() => setAthletePickerOpen(false)}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-accent hover:bg-surface-2"
                      >
                        <Users size={16} /> Athleten verwalten
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <span className="min-w-0 flex-1 truncate text-base font-semibold text-fg">
              {athlete.name}
              {compact && pageTitle && <span className="font-normal text-muted"> · {pageTitle}</span>}
            </span>
          )}

          <Link
            to={`/athlete/${athlete.id}/einstellungen`}
            aria-label="Einstellungen"
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 transition active:scale-90 ${onSettings ? 'text-accent' : 'text-fg'}`}
          >
            <Settings size={18} />
          </Link>
        </div>
      </header>

      {/* overflow-x-hidden: Beim Mitziehen ragt der Inhalt seitlich hinaus - ohne das könnte
          Safari waagerecht scrollen oder federn. Unten Platz für die schwebende Navigation. */}
      <main
        ref={mainRef}
        onScroll={(e) => {
          // Nur Anzeige (Rand + Titel in der Kopfzeile) - die Höhe der Kopfzeile bleibt gleich,
          // sonst springt der Inhalt beim Scrollen.
          const next = e.currentTarget.scrollTop > 36
          setCompact((c) => (c === next ? c : next))
        }}
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4 pb-36 lg:px-8 lg:pb-16"
      >
        <div className={`lg:mx-auto lg:w-full ${onSettings ? 'lg:max-w-3xl' : 'lg:max-w-6xl'}`}>
        {/* Großer Titel (iOS-Stil): scrollt mit dem Inhalt weg, danach steht er klein oben. */}
        <h1 key={pageTitle} className="anim-title -mt-2 mb-4 text-3xl font-bold tracking-tight text-fg">
          {pageTitle}
        </h1>
        {/* Neu gemountet je Reiter, damit der Seitenwechsel jedes Mal einblendet - beim
            Wischen und Antippen gleitet die Ansicht aus der passenden Richtung herein.
            Eigene Hülle für das Mitziehen beim Wischen - auf dem animierten Element darunter
            würde die Animation die Verschiebung überschreiben. */}
        <div ref={swipeContentRef}>
          <div key={pathname} className={`anim-stagger ${outerAnimation}`}>
            <Outlet context={{ athlete } satisfies { athlete: Athlete }} />
          </div>
        </div>
        </div>
      </main>
      </div>

      {!onSettings && prefs.quickAddButton && <QuickAddButton athlete={athlete} bottomOffset={desktop ? '1.5rem' : `calc(${NAV_BOTTOM} + 4.75rem)`} />}

      {/* Schwebende Navigation: abgerundete Leiste über dem Inhalt, mit Icon und Beschriftung. */}
      <nav
        className="absolute inset-x-3 z-30 grid lg:hidden gap-1 rounded-2xl border border-border bg-surface/95 p-1.5 shadow-2xl shadow-black/40 backdrop-blur-xl"
        style={{ bottom: NAV_BOTTOM, gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}
      >
        {/* Die Markierung gleitet zum aktiven Reiter - beim Antippen wie beim Wischen. */}
        {activeTab !== -1 && (
          <span
            aria-hidden="true"
            className="absolute top-1.5 bottom-1.5 left-1.5 rounded-xl bg-accent shadow-sm shadow-black/20 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              width: `calc((100% - 0.75rem - ${TABS.length - 1} * 0.25rem) / ${TABS.length})`,
              transform: `translateX(calc(${activeTab} * (100% + 0.25rem)))`,
            }}
          />
        )}
        {TABS.map((tab, i) => {
          const Icon = tab.icon
          return (
            <NavLink
              key={tab.label}
              to={`/athlete/${athleteId}${tab.to ? `/${tab.to}${subViewQuery(tab.to)}` : ''}`}
              state={activeTab !== -1 && i !== activeTab ? { swipe: i > activeTab ? 'next' : 'prev' } : undefined}
              end={tab.end}
              className={({ isActive }) =>
                `relative flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium leading-tight transition-colors duration-300 active:scale-95 ${
                  isActive ? 'text-accent-fg' : 'text-muted hover:text-fg'
                }`
              }
            >
              <Icon size={20} strokeWidth={2} />
              <span className="truncate">{tab.label}</span>
            </NavLink>
          )
        })}
      </nav>

      <FloatingRestTimer />
    </div>
  )
}

/** Initialen für den Avatar: erste Buchstaben der ersten beiden Wörter. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}
