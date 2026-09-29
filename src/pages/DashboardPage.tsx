import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { ChevronRight, CircleCheck, Droplet, Dumbbell, Flame, Pencil, Plus, Scale, Target, TrendingDown, TrendingUp, Beef } from 'lucide-react'
import { DASHBOARD_CARDS, useHiddenDashboardCards, type DashboardCardId } from '../lib/dashboardCards'
import { sortByOrder, usePrefs } from '../lib/prefs'
import { formatUnit, useUnits } from '../lib/units'
import { nextStep, nextTrainingPlan } from '../lib/nextStep'
import { waterGoalFor } from '../lib/water'
import { useTakesCreatine } from '../lib/useCreatine'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { Button, Card, CountUp, DecimalInput, Field, Input, ListRow, PageSkeleton, Select } from '../components/ui'
import CollapsibleCard from '../components/CollapsibleCard'
import Sheet from '../components/Sheet'
import type { Athlete, DailyEntry, Gender } from '../models/types'
import { ACTIVITY_LEVELS, GOALS, calculate, calculateBmi, calculateBodyFatFromFfmi } from '../lib/calculator'
import { addDays, repairStaleFfmiBodyFat, todayIso } from '../db/queries'
import ReminderBanner from '../components/ReminderBanner'
import ExportReportButton from '../components/ExportReportButton'
import CalendarOverview from '../components/CalendarOverview'
import StoryCards from '../components/Story'
import WeightSheet from '../components/WeightSheet'
import TourHint from '../components/TourHint'
import { useCoachMode, useSimpleMode } from '../lib/detailLevel'
import { useGrowIn } from '../lib/countUp'
import { forecastGoal, type Forecast } from '../lib/goalForecast'

type Ctx = { athlete: Athlete }

function update(athleteId: string, patch: Partial<Athlete>) {
  void db.athletes.update(athleteId, patch)
}

/**
 * Startseite eines Athleten. Oben das, was man täglich braucht (Tagesvorgabe, Wochenwerte),
 * darunter Kalender und Ziel-Fortschritt. Die Stammdaten stehen als eine Zeile da und werden
 * im Sheet bearbeitet - vorher füllte das Formular mit bis zu zwölf Feldern die halbe Seite.
 */
export default function DashboardPage() {
  const { athlete } = useOutletContext<Ctx>()
  const coachMode = useCoachMode()
  const simple = useSimpleMode()
  const [profileOpen, setProfileOpen] = useState(false)
  const entries = useLiveQuery(() => db.dailyEntries.where('athleteId').equals(athlete.id).toArray(), [athlete.id])
  const workoutLogs = useLiveQuery(() => db.workoutLogs.where('athleteId').equals(athlete.id).toArray(), [athlete.id])
  const creatine = useTakesCreatine(athlete.id)
  const navigate = useNavigate()
  const [hidden] = useHiddenDashboardCards()
  const show = (id: DashboardCardId) => !hidden.includes(id)
  const prefs = usePrefs()
  const units = useUnits()
  const go = (path: string) => navigate(`/athlete/${athlete.id}/${path}`, { state: { swipe: 'next' } })

  const weekStart = addDays(todayIso(), -6)
  const weekEntries = (entries ?? []).filter((e) => e.date >= weekStart && e.calories !== undefined)
  const avgCalories =
    weekEntries.length > 0 ? Math.round(weekEntries.reduce((sum, e) => sum + (e.calories ?? 0), 0) / weekEntries.length) : undefined
  const workoutsThisWeek = (workoutLogs ?? []).filter((w) => w.date >= weekStart).length

  const result = calculate({
    gender: athlete.gender,
    age: athlete.age,
    heightCm: athlete.heightCm,
    weightKg: athlete.weightKg,
    activityLevel: athlete.activityLevel,
    goal: athlete.goal,
    proteinPerKg: athlete.proteinPerKg,
    fatPerKg: athlete.fatPerKg,
    calorieAdjustmentKcal: athlete.calorieAdjustmentKcal,
  })

  const today = todayIso()
  const todayEntry = (entries ?? []).find((e) => e.date === today)
  const tracked = {
    kcal: todayEntry?.calories ?? 0,
    protein: todayEntry?.protein ?? 0,
    carbs: todayEntry?.carbs ?? 0,
    fat: todayEntry?.fat ?? 0,
  }
  const remaining = result.targetCalories - tracked.kcal
  const grown = useGrowIn()
  const [weightOpen, setWeightOpen] = useState(false)

  // Gewicht von heute - sonst das zuletzt gewogene, damit BMI und Kachel nicht leer bleiben.
  const weightToday = todayEntry?.weightKg
  const lastWeighed = (entries ?? [])
    .filter((e) => e.weightKg !== undefined && e.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.weightKg
  const bodyWeight = weightToday ?? lastWeighed
  const bmi = calculateBmi(bodyWeight ?? athlete.weightKg, athlete.heightCm)
  // KFA aus dem FFMI mit dem aktuellen Gewicht - nicht mit dem Profilgewicht (Startgewicht).
  // Nur zur Anzeige: In den Tageseintrag schreibt das Tracking bzw. das Gewicht-Sheet, jeweils
  // mit dem Gewicht des Tages. Früher schrieb das Dashboard hier bei jedem Öffnen den Wert
  // aus dem Startgewicht in den heutigen Eintrag und überdeckte damit echte Messungen.
  const bodyFatFromFfmi =
    athlete.ffmi !== undefined
      ? calculateBodyFatFromFfmi(athlete.ffmi, bodyWeight ?? athlete.weightKg, athlete.heightCm)
      : undefined

  useEffect(() => {
    void repairStaleFfmiBodyFat(athlete)
  }, [athlete])

  const bmiOk = bmi !== undefined && bmi >= 18.5 && bmi <= 24.9
  // Aktueller KFA: heute gemessen, sonst die letzte Messung, sonst aus dem FFMI.
  const lastBodyFat = (entries ?? [])
    .filter((e) => e.bodyFatPct !== undefined && e.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.bodyFatPct
  const bodyFat = todayEntry?.bodyFatPct ?? lastBodyFat ?? bodyFatFromFfmi

  const step = nextStep({
    weighedToday: weightToday !== undefined,
    proteinLeft: result.proteinG - tracked.protein,
    kcalLeft: remaining,
    waterLeftMl: waterGoalFor(athlete, bodyWeight, creatine) - (todayEntry?.waterMl ?? 0),
    hour: new Date().getHours(),
    hidden: prefs.hiddenHints,
    formatWater: prefs.volumeUnit === 'oz' ? (ml) => formatUnit(ml, 'volume', 0) : undefined,
  })
  const stepAction: Record<typeof step.kind, () => void> = {
    weight: () => setWeightOpen(true),
    protein: () => go('ernaehrung?view=log'),
    kcal: () => go('ernaehrung?view=log'),
    water: () => go('ernaehrung?view=log'),
    done: () => undefined,
  }
  const StepIcon = { weight: Scale, protein: Beef, kcal: Flame, water: Droplet, done: CircleCheck }[step.kind]

  if (entries === undefined) return <PageSkeleton />

  // Die sortier- und ausblendbaren Karten (Einstellungen → Dashboard).
  const cards: Record<DashboardCardId, ReactNode> = {
    naechsterSchritt: step && (
      <button
        type="button"
        onClick={stepAction[step.kind]}
        disabled={step.kind === 'done'}
        className="reveal flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left transition active:scale-[0.98]"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
          <StepIcon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-muted">Nächster Schritt</span>
          <span className="block text-sm text-fg">{step.text}</span>
        </span>
        {step.kind !== 'done' && <ChevronRight size={18} className="shrink-0 text-muted" />}
      </button>
    ),
    trainingHeute: <TodayTraining athlete={athlete} onGo={go} />,
    woche: (
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => go('ernaehrung?view=log')} className="text-left transition active:scale-95">
          <Tile label="Ø kcal · 7 Tage" value={<CountUp value={avgCalories} />} large />
        </button>
        <button type="button" onClick={() => go('training?view=log')} className="text-left transition active:scale-95">
          <Tile label="Trainings · 7 Tage" value={<CountUp value={workoutsThisWeek} />} large />
        </button>
      </div>
    ),
    story: <StoryCards athlete={athlete} entries={entries} targetKcal={result.targetCalories} targetProtein={result.proteinG} />,
    ziel: athlete.targetWeightKg !== undefined && <WeightGoalProgress athlete={athlete} entries={entries} />,
    kalender: <CalendarOverview entries={entries} workoutLogs={workoutLogs ?? []} />,
    rechenweg: !simple && (
      <CollapsibleCard title="Rechenweg" defaultExpanded={false}>
        <div className="grid grid-cols-2 gap-2">
          <Tile label="Grundumsatz (BMR)" value={`${result.bmr} kcal`} />
          <Tile label="Gesamtumsatz (TDEE)" value={`${result.tdee} kcal`} />
        </div>
        <p className="text-xs text-muted">
          Anpassung {result.calorieAdjustmentKcal > 0 ? '+' : ''}
          {result.calorieAdjustmentKcal} kcal · Kontrolle aus Makros: {result.controlCalories} kcal
        </p>
      </CollapsibleCard>
    ),
    export: !simple && <ExportReportButton athlete={athlete} entries={entries} result={result} />,
  }

  return (
    <div className="flex flex-col gap-4">
      <TourHint id="dashboard" />
      <ReminderBanner athleteId={athlete.id} entries={entries ?? []} />

      {/* Heute zuerst: was schon gegessen ist (hervorgehoben) gegen die Vorgabe, darunter die
          Körperwerte des Tages. Alle Zahlen zählen beim Erscheinen hoch. */}
      <Card className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted">Heute</h2>
          <span className="text-xs text-muted">{athlete.goal}</span>
        </div>
        <button type="button" onClick={() => go('ernaehrung?view=log')} className="flex flex-col gap-2 text-left transition active:scale-[0.98]" aria-label="Zum Ernährungslog">
          <div className="flex w-full items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-1.5">
              <CountUp value={tracked.kcal} className="text-4xl font-bold tabular-nums text-accent" />
              <span className="text-sm text-muted">kcal</span>
            </div>
            <span className="text-right text-sm tabular-nums text-muted">
              Vorgabe <span className="font-semibold text-fg">{result.targetCalories.toLocaleString('de-DE')}</span> kcal
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-[900ms] ease-out"
              style={{ width: `${grown ? percent(tracked.kcal, result.targetCalories) : 0}%` }}
            />
          </div>
          <p className="text-xs tabular-nums text-muted">
            {remaining >= 0
              ? `Noch ${Math.round(remaining).toLocaleString('de-DE')} kcal übrig`
              : `${Math.round(-remaining).toLocaleString('de-DE')} kcal über der Vorgabe`}
          </p>
        </button>
        <button type="button" onClick={() => go('ernaehrung?view=log')} className="grid grid-cols-3 gap-2 text-left transition active:scale-[0.98]" aria-label="Makros im Ernährungslog">
          <MacroTile label="Protein" value={tracked.protein} target={result.proteinG} grown={grown} delay={80} />
          <MacroTile label="Carbs" value={tracked.carbs} target={result.carbsG} grown={grown} delay={160} />
          <MacroTile label="Fett" value={tracked.fat} target={result.fatG} grown={grown} delay={240} />
        </button>
        <div className="grid grid-cols-3 gap-2 border-t border-border pt-4">
          {/* Antippen trägt das heutige Gewicht ein - ohne Umweg über das Tracking. */}
          <button
            type="button"
            onClick={() => setWeightOpen(true)}
            aria-label="Gewicht eintragen"
            className="relative text-left transition active:scale-95"
          >
            <Tile
              label="Gewicht"
              value={bodyWeight !== undefined ? <><CountUp value={units.show(bodyWeight, 'weight')} decimals={1} /> {units.label('weight')}</> : '–'}
              hint={weightToday === undefined ? (bodyWeight !== undefined ? 'zuletzt' : 'eintragen') : undefined}
            />
            <span aria-hidden="true" className="absolute top-2 right-2 text-accent">
              {weightToday === undefined ? <Plus size={13} /> : <Pencil size={12} />}
            </span>
          </button>
          <button type="button" onClick={() => go('tracking')} className="text-left transition active:scale-95" aria-label="BMI im Tracking">
            <Tile
              label="BMI"
              value={<CountUp value={bmi} decimals={1} />}
              tone={bmi === undefined ? 'default' : bmiOk ? 'ok' : 'danger'}
            />
          </button>
          <button type="button" onClick={() => go('tracking')} className="text-left transition active:scale-95" aria-label="KFA im Tracking">
            <Tile
              label="KFA"
              value={bodyFat !== undefined ? <><CountUp value={bodyFat} decimals={1} /> %</> : '–'}
              hint={todayEntry?.bodyFatPct === undefined && lastBodyFat !== undefined ? 'zuletzt' : undefined}
            />
          </button>
        </div>
      </Card>

      {sortByOrder(DASHBOARD_CARDS, prefs.dashboardOrder)
        .filter((c) => show(c.id))
        .map((c) => (
          <Fragment key={c.id}>{cards[c.id]}</Fragment>
        ))}

      <section className="flex flex-col gap-1.5">
        <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted">Profil</h2>
        <ListRow
          title={`${athlete.gender} · ${athlete.age} J · ${units.format(athlete.heightCm, 'length', 0)} · ${units.format(athlete.weightKg, 'weight')}`}
          subtitle={`${athlete.goal} · ${athlete.activityLevel}`}
          value={<ChevronRight size={16} />}
          onClick={() => setProfileOpen(true)}
          ariaLabel="Profil bearbeiten"
        />
      </section>

      <WeightSheet
        open={weightOpen}
        athleteId={athlete.id}
        date={today}
        initial={weightToday ?? lastWeighed}
        ffmi={athlete.ffmi}
        heightCm={athlete.heightCm}
        onClose={() => setWeightOpen(false)}
      />

      <ProfileSheet
        open={profileOpen}
        athlete={athlete}
        calorieAdjustmentKcal={result.calorieAdjustmentKcal}
        bodyFatFromFfmi={bodyFatFromFfmi}
        simple={simple}
        coachMode={coachMode}
        onClose={() => setProfileOpen(false)}
      />
    </div>
  )
}


/** Kennzahl-Kachel - kleiner Titel, große Zahl. */
function Tile({
  label,
  value,
  tone = 'default',
  large = false,
  hint,
}: {
  label: string
  value: ReactNode
  tone?: 'default' | 'ok' | 'danger'
  large?: boolean
  hint?: string
}) {
  const toneClass = tone === 'ok' ? 'text-ok' : tone === 'danger' ? 'text-danger' : 'text-fg'
  return (
    <div className={`reveal flex flex-col gap-0.5 rounded-xl ${large ? 'border border-border bg-surface px-3 py-3' : 'bg-surface-2 px-2.5 py-2'}`}>
      <span className="text-[11px] text-muted">
        {label}
        {hint && <span className="opacity-70"> · {hint}</span>}
      </span>
      <span className={`${large ? 'text-xl' : 'text-base'} font-semibold tabular-nums ${toneClass}`}>{value}</span>
    </div>
  )
}

function percent(value: number, target: number): number {
  if (target <= 0) return 0
  return Math.max(0, Math.min(100, (value / target) * 100))
}

/** Makro-Kachel der Heute-Karte: getrackt gegen Vorgabe, mit anwachsendem Balken. */
function MacroTile({ label, value, target, grown, delay }: { label: string; value: number; target: number; grown: boolean; delay: number }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-surface-2 px-2.5 py-2">
      <span className="text-[11px] text-muted">{label}</span>
      <span className="whitespace-nowrap text-[13px] tabular-nums">
        <CountUp value={value} className="font-semibold text-accent" />
        <span className="text-muted"> / {Math.round(target)} g</span>
      </span>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
          style={{ width: `${grown ? percent(value, target) : 0}%`, transitionDelay: `${delay}ms` }}
        />
      </div>
    </div>
  )
}

/**
 * Stammdaten im Sheet. Jede Änderung wird sofort gespeichert (wie vorher im Formular) - die
 * Tagesvorgabe auf der Seite dahinter rechnet live mit.
 */
function ProfileSheet({
  open,
  athlete,
  calorieAdjustmentKcal,
  bodyFatFromFfmi,
  simple,
  coachMode,
  onClose,
}: {
  open: boolean
  athlete: Athlete
  calorieAdjustmentKcal: number
  bodyFatFromFfmi?: number
  simple: boolean
  coachMode: boolean
  onClose: () => void
}) {
  return (
    <Sheet
      open={open}
      title="Profil"
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Fertig
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Geschlecht">
          <Select value={athlete.gender} onChange={(e) => update(athlete.id, { gender: e.target.value as Gender })}>
            <option value="Männlich">Männlich</option>
            <option value="Weiblich">Weiblich</option>
          </Select>
        </Field>
        <Field label="Alter (Jahre)">
          <DecimalInput value={athlete.age} onChange={(n) => update(athlete.id, { age: n ?? 0 })} />
        </Field>
        <Field label="Größe (cm)">
          <DecimalInput value={athlete.heightCm} onChange={(n) => update(athlete.id, { heightCm: n ?? 0 })} />
        </Field>
        <Field label="Gewicht (kg)">
          <DecimalInput value={athlete.weightKg} onChange={(n) => update(athlete.id, { weightKg: n ?? 0 })} />
        </Field>
      </div>
      <Field label="Aktivitätslevel">
        <Select value={athlete.activityLevel} onChange={(e) => update(athlete.id, { activityLevel: e.target.value })}>
          {ACTIVITY_LEVELS.map((a) => (
            <option key={a.label} value={a.label}>
              {a.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Ziel">
        <Select value={athlete.goal} onChange={(e) => update(athlete.id, { goal: e.target.value })}>
          {GOALS.map((g) => (
            <option key={g.label} value={g.label}>
              {g.label}
            </option>
          ))}
        </Select>
      </Field>
      {/* In der Einfach-Ansicht steuert allein die Ziel-Auswahl das Defizit bzw. den
          Überschuss - ein vorzeichenbehaftetes kcal-Feld verwirrt dort mehr, als es nützt. */}
      {!simple && (
        <Field label="Kalorien-Anpassung (kcal, + Überschuss / − Defizit)">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => update(athlete.id, { calorieAdjustmentKcal: -calorieAdjustmentKcal })}
              className="shrink-0 px-3"
              title="Vorzeichen umkehren"
            >
              ±
            </Button>
            <DecimalInput
              value={calorieAdjustmentKcal}
              onChange={(n) => update(athlete.id, { calorieAdjustmentKcal: n ?? 0 })}
              className="flex-1"
            />
          </div>
        </Field>
      )}

      {coachMode && (
        <>
          <h3 className="pt-2 text-xs font-medium uppercase tracking-wide text-muted">Coach</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Protein (g/kg)">
              <DecimalInput value={athlete.proteinPerKg} onChange={(n) => update(athlete.id, { proteinPerKg: n ?? 0 })} />
            </Field>
            <Field label="Fett (g/kg)">
              <DecimalInput value={athlete.fatPerKg} onChange={(n) => update(athlete.id, { fatPerKg: n ?? 0 })} />
            </Field>
            <Field label="Zielgewicht (kg)">
              <DecimalInput value={athlete.targetWeightKg} onChange={(n) => update(athlete.id, { targetWeightKg: n })} />
            </Field>
            <Field label="FFMI (kg/m²)">
              <DecimalInput value={athlete.ffmi} onChange={(n) => update(athlete.id, { ffmi: n })} placeholder="z.B. 22" />
            </Field>
          </div>
          {bodyFatFromFfmi !== undefined && (
            <p className="text-xs text-muted">KFA aus FFMI bei aktuellem Gewicht: {bodyFatFromFfmi.toFixed(1)} % – wird beim Eintragen des Gewichts für den Tag übernommen.</p>
          )}
          <Field label="Startdatum (Tag 1)">
            <Input
              type="date"
              value={athlete.startDate}
              max={todayIso()}
              onChange={(e) => update(athlete.id, { startDate: e.target.value })}
            />
          </Field>
          <Field label="Ziel-Datum">
            <Input
              type="date"
              value={athlete.targetDate ?? ''}
              onChange={(e) => update(athlete.id, { targetDate: e.target.value || undefined })}
            />
          </Field>
        </>
      )}
    </Sheet>
  )
}

function WeightGoalProgress({ athlete, entries }: { athlete: Athlete; entries: DailyEntry[] }) {
  const grown = useGrowIn()
  if (athlete.targetWeightKg === undefined) return null

  const weighed = entries.filter((e) => e.weightKg !== undefined).sort((a, b) => a.date.localeCompare(b.date))
  const startWeight = weighed[0]?.weightKg
  const currentWeight = weighed[weighed.length - 1]?.weightKg

  if (startWeight === undefined || currentWeight === undefined) {
    return (
      <Card className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-muted">Zielgewicht {formatUnit(athlete.targetWeightKg, 'weight')}</h2>
        <p className="text-sm text-muted">Noch keine Gewichtsdaten für den Fortschritt.</p>
      </Card>
    )
  }

  const totalDelta = athlete.targetWeightKg - startWeight
  const currentDelta = currentWeight - startWeight
  const pct = totalDelta === 0 ? 100 : Math.min(100, Math.max(0, (currentDelta / totalDelta) * 100))
  const remaining = Math.abs(athlete.targetWeightKg - currentWeight)
  const forecast = forecastGoal(weighed, athlete.targetWeightKg, todayIso())

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted">Zielgewicht</h2>
        <span className="text-lg font-semibold tabular-nums text-fg">
          <CountUp value={pct} /> %
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-[width] duration-[900ms] ease-out" style={{ width: `${grown ? pct : 0}%` }} />
      </div>
      <p className="text-xs text-muted">
        {formatUnit(currentWeight, 'weight')} → {formatUnit(athlete.targetWeightKg, 'weight')} · noch {formatUnit(remaining, 'weight')}
        {athlete.targetDate ? ` · bis ${new Date(`${athlete.targetDate}T00:00:00`).toLocaleDateString('de-DE')}` : ''}
      </p>
      <ForecastLine forecast={forecast} targetKg={athlete.targetWeightKg} targetDate={athlete.targetDate} />
    </Card>
  )
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/** Ein Satz zur Zielprognose aus dem Trend der letzten 2 Wochen (siehe `forecastGoal`). */
function ForecastLine({ forecast, targetKg, targetDate }: { forecast: Forecast; targetKg: number; targetDate?: string }) {
  if (forecast.kind === 'insufficient') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <TrendingUp size={14} /> Prognose ab 5 Wiegungen innerhalb von 2 Wochen.
      </p>
    )
  }
  if (forecast.kind === 'reached')
    return (
      <p className="flex items-center gap-1.5 text-xs text-fg">
        <Target size={14} className="text-accent" /> Ziel laut Trend erreicht – stark!
      </p>
    )
  const tempo = `${forecast.perWeek > 0 ? '+' : '−'}${formatUnit(Math.abs(forecast.perWeek), 'weight', 2)}/Woche`
  const target = formatUnit(targetKg, 'weight')
  if (forecast.kind === 'away') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <TrendingDown size={14} className="shrink-0" /> Aktueller Trend {tempo} – so wird {target} gerade nicht erreicht.
      </p>
    )
  }
  const onTime = targetDate ? forecast.date <= targetDate : undefined
  return (
    <p className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-fg">
      <TrendingUp size={14} className="mr-1 inline -translate-y-px text-accent" />
      Bei deinem Tempo ({tempo}) erreichst du {target} etwa am <span className="font-semibold">{formatDate(forecast.date)}</span>
      {onTime === undefined ? '.' : onTime ? ' – vor deinem Zieldatum.' : ' – nach deinem Zieldatum.'}
    </p>
  )
}

/** Heutiges Training: laufende Einheit mit Fortschritt, sonst der nächste Plan-Tag zum Starten. */
function TodayTraining({ athlete, onGo }: { athlete: Athlete; onGo: (path: string) => void }) {
  const today = todayIso()
  const data = useLiveQuery(async () => {
    const [plans, logs, planExercises] = await Promise.all([
      db.trainingPlans.where('athleteId').equals(athlete.id).toArray(),
      db.workoutLogs.where('athleteId').equals(athlete.id).toArray(),
      db.trainingPlanExercises.toArray(),
    ])
    const withExercises = new Set(planExercises.map((pe) => pe.planId))
    const todayLog = logs.find((l) => l.date === today)
    let progress: { done: number; total: number } | undefined
    if (todayLog) {
      const rows = await db.workoutLogExercises.where('workoutLogId').equals(todayLog.id).toArray()
      const sets = await db.workoutSets.where('workoutLogExerciseId').anyOf(rows.map((r) => r.id)).toArray()
      progress = { done: sets.filter((x) => x.done).length, total: sets.length }
    }
    const next = nextTrainingPlan(plans, withExercises, logs, today)
    const exerciseCount = next ? planExercises.filter((pe) => pe.planId === next.id).length : 0
    const todayPlan = todayLog?.trainingPlanId ? plans.find((p) => p.id === todayLog.trainingPlanId) : undefined
    return { todayLog, progress, next, exerciseCount, todayPlan }
  }, [athlete.id, today])
  if (!data) return null
  const { todayLog, progress, next, exerciseCount, todayPlan } = data
  const started = !!todayLog && (progress?.total ?? 0) > 0
  if (!started && !next) return null

  const finished = !!todayLog?.completedAt
  // Geplante Trainingstage (aus „Dein Start“): an anderen Tagen ist Ruhetag - starten geht trotzdem.
  const weekday = (new Date().getDay() + 6) % 7
  const restDay = !started && !!athlete.trainingDays?.length && !athlete.trainingDays.includes(weekday)
  const title = started ? (todayPlan?.phaseName ?? 'Training heute') : restDay ? 'Heute Ruhetag' : next!.phaseName
  const sub = finished
    ? 'Heute abgeschlossen'
    : started
      ? `${progress!.done}/${progress!.total} Sätze erledigt`
      : restDay
        ? `Nächstes Training: ${next!.phaseName}`
        : `Heute dran · ${exerciseCount} ${exerciseCount === 1 ? 'Übung' : 'Übungen'}`

  return (
    <Card className="flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
        {finished ? <CircleCheck size={20} /> : <Dumbbell size={20} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg">{title}</p>
        <p className="text-xs tabular-nums text-muted">{sub}</p>
        {started && !finished && (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(progress!.done / progress!.total) * 100}%` }} />
          </div>
        )}
      </div>
      {!finished && (
        <button
          type="button"
          onClick={() => onGo(started ? 'training?view=log' : `training?view=log&plan=${next!.id}`)}
          className="shrink-0 rounded-xl bg-accent px-3.5 py-2 text-sm font-semibold text-accent-fg transition active:scale-95"
        >
          {started ? 'Weiter' : restDay ? 'Trotzdem' : 'Starten'}
        </button>
      )}
    </Card>
  )
}
