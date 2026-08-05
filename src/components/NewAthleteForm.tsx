import { useState } from 'react'
import { ACCENT_COLORS, createAthlete, todayIso } from '../db/queries'
import { ACTIVITY_LEVELS, GOALS } from '../lib/calculator'
import type { Athlete, Gender } from '../models/types'
import { AccentSwatch, Button, Card, Field, Input, Select } from './ui'

/**
 * Formular zum Anlegen eines Athleten. Wird an zwei Stellen gebraucht: auf der
 * Athletenverwaltung und als Begrüßungsbildschirm, wenn noch gar kein Athlet existiert -
 * deshalb liegt es als eigene Komponente und nicht mehr in der Verwaltungsseite.
 *
 * `onCreated` bekommt den fertigen Athleten, damit die aufrufende Seite direkt zu ihm
 * navigieren kann. `onCancel` fehlt beim Begrüßungsbildschirm bewusst: Dort gibt es nichts,
 * wohin man abbrechen könnte.
 */
export default function NewAthleteForm({
  onCreated,
  onCancel,
  submitLabel = 'Anlegen',
}: {
  onCreated: (athlete: Athlete) => void
  onCancel?: () => void
  submitLabel?: string
}) {
  const [name, setName] = useState('')
  const [gender, setGender] = useState<Gender>('Männlich')
  const [age, setAge] = useState(30)
  const [heightCm, setHeightCm] = useState(180)
  const [weightKg, setWeightKg] = useState(80)
  const [activityLevel, setActivityLevel] = useState(ACTIVITY_LEVELS[2].label)
  const [goal, setGoal] = useState(GOALS[1].label)
  const [accentColor, setAccentColor] = useState(ACCENT_COLORS[0])

  async function submit() {
    if (!name.trim()) return
    const athlete = await createAthlete({
      name: name.trim(),
      gender,
      age,
      heightCm,
      weightKg,
      activityLevel,
      goal,
      proteinPerKg: 2.2,
      fatPerKg: 1,
      startDate: todayIso(),
      accentColor,
    })
    onCreated(athlete)
  }

  return (
    <Card className="flex flex-col gap-3">
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Max" autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Geschlecht">
          <Select value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
            <option value="Männlich">Männlich</option>
            <option value="Weiblich">Weiblich</option>
          </Select>
        </Field>
        <Field label="Alter (Jahre)">
          <Input type="number" value={age} onChange={(e) => setAge(Number(e.target.value))} />
        </Field>
        <Field label="Größe (cm)">
          <Input type="number" value={heightCm} onChange={(e) => setHeightCm(Number(e.target.value))} />
        </Field>
        <Field label="Gewicht (kg)">
          <Input type="number" value={weightKg} onChange={(e) => setWeightKg(Number(e.target.value))} />
        </Field>
      </div>
      <Field label="Aktivitätslevel">
        <Select value={activityLevel} onChange={(e) => setActivityLevel(e.target.value)}>
          {ACTIVITY_LEVELS.map((a) => (
            <option key={a.label} value={a.label}>
              {a.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Ziel">
        <Select value={goal} onChange={(e) => setGoal(e.target.value)}>
          {GOALS.map((g) => (
            <option key={g.label} value={g.label}>
              {g.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Akzentfarbe">
        <div className="flex flex-wrap gap-2">
          {ACCENT_COLORS.map((color) => (
            <AccentSwatch
              key={color}
              color={color}
              selected={accentColor === color}
              onSelect={setAccentColor}
              className="h-7 w-7"
            />
          ))}
        </div>
      </Field>
      <div className="flex gap-2">
        <Button variant="primary" onClick={submit} className="flex-1">
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Abbrechen
          </Button>
        )}
      </div>
    </Card>
  )
}
