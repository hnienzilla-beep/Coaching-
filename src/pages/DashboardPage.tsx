import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { Button, Card, DecimalInput, Field, Input, ListRow, Select } from '../components/ui'
import CollapsibleCard from '../components/CollapsibleCard'
import Sheet from '../components/Sheet'
import type { Athlete, DailyEntry, Gender } from '../models/types'
import { ACTIVITY_LEVELS, GOALS, calculate, calculateBmi, calculateBodyFatFromFfmi } from '../lib/calculator'
import { addDays, syncBodyFatToDailyEntry, todayIso } from '../db/queries'
import ReminderBanner from '../components/ReminderBanner'
import ExportReportButton from '../components/ExportReportButton'
import CalendarOverview from '../components/CalendarOverview'
import { useCoachMode, useSimpleMode } from '../lib/detailLevel'

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

  const bmi = calculateBmi(athlete.weightKg, athlete.heightCm)
  const bodyFatFromFfmi =
    athlete.ffmi !== undefined ? calculateBodyFatFromFfmi(athlete.ffmi, athlete.weightKg, athlete.heightCm) : undefined

  useEffect(() => {
    if (bodyFatFromFfmi === undefined || !Number.isFinite(bodyFatFromFfmi)) return
    void syncBodyFatToDailyEntry(athlete.id, todayIso(), bodyFatFromFfmi)
  }, [athlete.id, bodyFatFromFfmi])

  const bmiOk = bmi !== undefined && bmi >= 18.5 && bmi <= 24.9

  return (
    <div className="flex flex-col gap-4">
      <ReminderBanner athleteId={athlete.id} entries={entries ?? []} />

      {/* Die Tagesvorgabe ist die Zahl, gegen die jeder Tag gemessen wird - deshalb ganz oben. */}
      <Card className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted">Deine Tagesvorgabe</h2>
          <span className="text-xs text-muted">{athlete.goal}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold tabular-nums text-fg">{result.targetCalories.toLocaleString('de-DE')}</span>
          <span className="text-sm text-muted">kcal</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Protein" value={`${result.proteinG} g`} />
          <Tile label="Carbs" value={`${result.carbsG} g`} />
          <Tile label="Fett" value={`${result.fatG} g`} />
        </div>
      </Card>

      <div className={`grid gap-2 ${coachMode ? 'grid-cols-2' : 'grid-cols-3'}`}>
        <Tile label="Ø kcal · 7 Tage" value={avgCalories !== undefined ? avgCalories.toLocaleString('de-DE') : '–'} large />
        <Tile label="Trainings · 7 Tage" value={`${workoutsThisWeek}`} large />
        <Tile label="BMI" value={bmi !== undefined ? bmi.toFixed(1) : '–'} tone={bmi === undefined ? 'default' : bmiOk ? 'ok' : 'danger'} large />
        {coachMode && (
          <Tile label="KFA (aus FFMI)" value={bodyFatFromFfmi !== undefined ? `${bodyFatFromFfmi.toFixed(1)} %` : '–'} large />
        )}
      </div>

      {athlete.targetWeightKg !== undefined && <WeightGoalProgress athlete={athlete} entries={entries ?? []} />}

      <CalendarOverview entries={entries ?? []} workoutLogs={workoutLogs ?? []} />

      <section className="flex flex-col gap-1.5">
        <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted">Profil</h2>
        <ListRow
          title={`${athlete.gender} · ${athlete.age} J · ${athlete.heightCm} cm · ${athlete.weightKg} kg`}
          subtitle={`${athlete.goal} · ${athlete.activityLevel}`}
          value="›"
          onClick={() => setProfileOpen(true)}
          ariaLabel="Profil bearbeiten"
        />
      </section>

      {!simple && (
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
      )}

      {!simple && <ExportReportButton athlete={athlete} entries={entries ?? []} result={result} />}

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
}: {
  label: string
  value: string
  tone?: 'default' | 'ok' | 'danger'
  large?: boolean
}) {
  const toneClass = tone === 'ok' ? 'text-ok' : tone === 'danger' ? 'text-danger' : 'text-fg'
  return (
    <div className={`reveal flex flex-col gap-0.5 rounded-xl ${large ? 'border border-border bg-surface px-3 py-3' : 'bg-surface-2 px-2.5 py-2'}`}>
      <span className="text-[11px] text-muted">{label}</span>
      <span className={`${large ? 'text-xl' : 'text-base'} font-semibold tabular-nums ${toneClass}`}>{value}</span>
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
            <p className="text-xs text-muted">KFA aus FFMI: {bodyFatFromFfmi.toFixed(1)} % – wird in den heutigen Tracking-Eintrag übernommen.</p>
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
  if (athlete.targetWeightKg === undefined) return null

  const weighed = entries.filter((e) => e.weightKg !== undefined).sort((a, b) => a.date.localeCompare(b.date))
  const startWeight = weighed[0]?.weightKg
  const currentWeight = weighed[weighed.length - 1]?.weightKg

  if (startWeight === undefined || currentWeight === undefined) {
    return (
      <Card className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-muted">Zielgewicht {athlete.targetWeightKg} kg</h2>
        <p className="text-sm text-muted">Noch keine Gewichtsdaten für den Fortschritt.</p>
      </Card>
    )
  }

  const totalDelta = athlete.targetWeightKg - startWeight
  const currentDelta = currentWeight - startWeight
  const pct = totalDelta === 0 ? 100 : Math.min(100, Math.max(0, (currentDelta / totalDelta) * 100))
  const remaining = Math.abs(athlete.targetWeightKg - currentWeight)

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted">Zielgewicht</h2>
        <span className="text-lg font-semibold tabular-nums text-fg">{pct.toFixed(0)} %</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted">
        {currentWeight} kg → {athlete.targetWeightKg} kg · noch {remaining.toFixed(1)} kg
        {athlete.targetDate ? ` · bis ${new Date(`${athlete.targetDate}T00:00:00`).toLocaleDateString('de-DE')}` : ''}
      </p>
    </Card>
  )
}
