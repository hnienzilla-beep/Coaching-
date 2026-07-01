import { useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { Card, Field, Input, Select, StatBadge } from '../components/ui'
import type { Athlete, Gender } from '../models/types'
import { ACTIVITY_LEVELS, GOALS, calculate } from '../lib/calculator'
import { isoDate } from '../db/queries'
import ReminderBanner from '../components/ReminderBanner'
import ExportReportButton from '../components/ExportReportButton'

type Ctx = { athlete: Athlete }

function update(athleteId: string, patch: Partial<Athlete>) {
  void db.athletes.update(athleteId, patch)
}

export default function DashboardPage() {
  const { athlete } = useOutletContext<Ctx>()
  const entries = useLiveQuery(() => db.dailyEntries.where('athleteId').equals(athlete.id).toArray(), [athlete.id])

  const result = calculate({
    gender: athlete.gender,
    age: athlete.age,
    heightCm: athlete.heightCm,
    weightKg: athlete.weightKg,
    activityLevel: athlete.activityLevel,
    goal: athlete.goal,
    proteinPerKg: athlete.proteinPerKg,
    fatPerKg: athlete.fatPerKg,
  })

  return (
    <div className="flex flex-col gap-4">
      <ReminderBanner athleteId={athlete.id} entries={entries ?? []} />

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
            <Input type="number" value={athlete.age} onChange={(e) => update(athlete.id, { age: Number(e.target.value) })} />
          </Field>
          <Field label="Größe (cm)">
            <Input type="number" value={athlete.heightCm} onChange={(e) => update(athlete.id, { heightCm: Number(e.target.value) })} />
          </Field>
          <Field label="Gewicht (kg)">
            <Input
              type="number"
              step="0.1"
              value={athlete.weightKg}
              onChange={(e) => update(athlete.id, { weightKg: Number(e.target.value) })}
            />
          </Field>
          <Field label="Protein (g/kg)">
            <Input
              type="number"
              step="0.1"
              value={athlete.proteinPerKg}
              onChange={(e) => update(athlete.id, { proteinPerKg: Number(e.target.value) })}
            />
          </Field>
          <Field label="Fett (g/kg)">
            <Input
              type="number"
              step="0.1"
              value={athlete.fatPerKg}
              onChange={(e) => update(athlete.id, { fatPerKg: Number(e.target.value) })}
            />
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
