import { useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { Button, Card, DecimalInput, Field, Input, Select, StatBadge } from '../components/ui'
import type { Athlete, Gender } from '../models/types'
import { ACTIVITY_LEVELS, GOALS, calculate } from '../lib/calculator'
import { addDays, isoDate } from '../db/queries'
import ReminderBanner from '../components/ReminderBanner'
import ExportReportButton from '../components/ExportReportButton'

type Ctx = { athlete: Athlete }

function update(athleteId: string, patch: Partial<Athlete>) {
  void db.athletes.update(athleteId, patch)
}

export default function DashboardPage() {
  const { athlete } = useOutletContext<Ctx>()
  const entries = useLiveQuery(() => db.dailyEntries.where('athleteId').equals(athlete.id).toArray(), [athlete.id])
  const workoutLogs = useLiveQuery(() => db.workoutLogs.where('athleteId').equals(athlete.id).toArray(), [athlete.id])

  const weekStart = addDays(isoDate(new Date()), -6)
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

  return (
    <div className="flex flex-col gap-4">
      <ReminderBanner athleteId={athlete.id} entries={entries ?? []} />

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Wochenüberblick (letzte 7 Tage)</h2>
        <div className="grid grid-cols-2 gap-2">
          <StatBadge label="Ø Kalorien" value={avgCalories !== undefined ? `${avgCalories}` : '–'} />
          <StatBadge label="Trainingseinheiten" value={`${workoutsThisWeek}`} />
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Stammdaten</h2>
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
          <Field label="Protein (g/kg)">
            <DecimalInput value={athlete.proteinPerKg} onChange={(n) => update(athlete.id, { proteinPerKg: n ?? 0 })} />
          </Field>
          <Field label="Fett (g/kg)">
            <DecimalInput value={athlete.fatPerKg} onChange={(n) => update(athlete.id, { fatPerKg: n ?? 0 })} />
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
        <Field label="Ziel (Schnellauswahl)">
          <Select value={athlete.goal} onChange={(e) => update(athlete.id, { goal: e.target.value })}>
            {GOALS.map((g) => (
              <option key={g.label} value={g.label}>
                {g.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Kalorien-Anpassung (kcal, +Überschuss/-Defizit)">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => update(athlete.id, { calorieAdjustmentKcal: -result.calorieAdjustmentKcal })}
              className="shrink-0 px-3"
              title="Vorzeichen umkehren"
            >
              ±
            </Button>
            <DecimalInput
              value={result.calorieAdjustmentKcal}
              onChange={(n) => update(athlete.id, { calorieAdjustmentKcal: n ?? 0 })}
              className="flex-1"
            />
          </div>
        </Field>
        <Field label="Startdatum (Tag 1)">
          <Input
            type="date"
            value={athlete.startDate}
            max={isoDate(new Date())}
            onChange={(e) => update(athlete.id, { startDate: e.target.value })}
          />
        </Field>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Kalorienrechner</h2>
        <div className="grid grid-cols-3 gap-2">
          <StatBadge label="BMR" value={`${result.bmr}`} />
          <StatBadge label="TDEE" value={`${result.tdee}`} />
          <StatBadge label="Zielkalorien" value={`${result.targetCalories}`} tone="ok" />
          <StatBadge label="Protein" value={`${result.proteinG} g`} />
          <StatBadge label="Fett" value={`${result.fatG} g`} />
          <StatBadge label="Carbs" value={`${result.carbsG} g`} />
        </div>
        <p className="text-xs text-muted">Kontrolle (kcal aus Makros): {result.controlCalories} kcal</p>
      </Card>

      <ExportReportButton athlete={athlete} entries={entries ?? []} result={result} />
    </div>
  )
}
