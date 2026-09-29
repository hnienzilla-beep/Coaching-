import { useEffect, useRef, useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useParams, Link } from 'react-router-dom'
import { Check, ChevronDown, Dumbbell, LayoutDashboard, LineChart, Settings, UserPlus, Users, Utensils } from 'lucide-react'
import { subViewQuery, swipeAnimationClass, useSwipeNavigation } from '../lib/swipeNavigation'
import { usePrefs, type TabKey } from '../lib/prefs'
import { startReminders } from '../lib/reminders'
import { SECTIONS } from '../lib/settingsMeta'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { sortAthletes } from '../db/queries'
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

  return (
    <div className="relative mx-auto flex h-full max-w-md flex-col overflow-hidden">
      <header
        className={`shrink-0 border-b px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 transition-colors duration-300 ${
          compact ? 'border-border bg-bg/85 backdrop-blur-xl' : 'border-transparent'
        }`}
      >
        <div className="flex items-center gap-3">
          <Link
            to={`/athlete/${athlete.id}/einstellungen`}
            aria-label="Einstellungen"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-fg transition active:scale-90"
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
                        to="/athleten?neu=1"
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
        {/* Großer Titel, der beim Scrollen einklappt (iOS-Stil). */}
        <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${compact ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}>
          <div className="overflow-hidden">
            <h1 key={pageTitle} className="anim-title pt-2 text-3xl font-bold tracking-tight text-fg">
              {pageTitle}
            </h1>
          </div>
        </div>
      </header>

      {/* overflow-x-hidden: Beim Mitziehen ragt der Inhalt seitlich hinaus - ohne das könnte
          Safari waagerecht scrollen oder federn. Unten Platz für die schwebende Navigation. */}
      <main
        ref={mainRef}
        onScroll={(e) => {
          const top = e.currentTarget.scrollTop
          // Mit Abstand zwischen Ein- und Ausklappen, sonst flackert es an der Schwelle.
          setCompact((c) => (c ? top > 8 : top > 40))
        }}
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4 pb-36"
      >
        {/* Neu gemountet je Reiter, damit der Seitenwechsel jedes Mal einblendet - beim
            Wischen und Antippen gleitet die Ansicht aus der passenden Richtung herein.
            Eigene Hülle für das Mitziehen beim Wischen - auf dem animierten Element darunter
            würde die Animation die Verschiebung überschreiben. */}
        <div ref={swipeContentRef}>
          <div key={pathname} className={`anim-stagger ${outerAnimation}`}>
            <Outlet context={{ athlete } satisfies { athlete: Athlete }} />
          </div>
        </div>
      </main>

      {!onSettings && prefs.quickAddButton && <QuickAddButton athlete={athlete} bottomOffset={`calc(${NAV_BOTTOM} + 4.75rem)`} />}

      {/* Schwebende Navigation: abgerundete Leiste über dem Inhalt, mit Icon und Beschriftung. */}
      <nav
        className="absolute inset-x-3 z-30 grid gap-1 rounded-2xl border border-border bg-surface/95 p-1.5 shadow-2xl shadow-black/40 backdrop-blur-xl"
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
