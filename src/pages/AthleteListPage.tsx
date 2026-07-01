import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db, ensureFoodSeed, ensureSupplementSeed } from '../db/db'
import { createAthlete, deleteAthlete, isoDate } from '../db/queries'
import { Button, Card, Field, Input, Select } from '../components/ui'
import type { Gender } from '../models/types'
import { ACTIVITY_LEVELS, GOALS } from '../lib/calculator'

export default function AthleteListPage() {
  const athletes = useLiveQuery(() => db.athletes.toArray(), [])
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    ensureFoodSeed()
    ensureSupplementSeed()
  }, [])

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-4 pb-10">
      <header className="flex items-center justify-between pt-[max(1rem,env(safe-area-inset-top))]">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Bodybuilding Coach</h1>
          <p className="text-sm text-muted">Athleten verwalten</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Link to="/lebensmittel" className="text-sm text-accent underline underline-offset-2">
            Lebensmittel-DB
          </Link>
          <Link to="/supplemente" className="text-sm text-accent underline underline-offset-2">
            Supplement-DB
          </Link>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        {athletes?.length === 0 && (
          <Card className="text-center text-sm text-muted">Noch keine Athleten angelegt. Leg den ersten an.</Card>
        )}
        {athletes?.map((a) => (
          <Card key={a.id} className="flex items-center justify-between">
            <Link to={`/athlete/${a.id}`} className="flex flex-1 items-center gap-3">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: a.accentColor }} />
              <div>
                <div className="font-semibold text-zinc-100">{a.name}</div>
                <div className="text-xs text-muted">
                  {a.weightKg} kg · {a.goal}
                </div>
              </div>
            </Link>
            <Button
              variant="danger"
              onClick={async (e) => {
                e.preventDefault()
                if (confirm(`Athlet "${a.name}" wirklich löschen? Alle Daten gehen verloren.`)) {
                  await deleteAthlete(a.id)
                }
              }}
            >
              Löschen
            </Button>
          </Card>
        ))}
      </div>

      {showForm ? (
        <NewAthleteForm onDone={() => setShowForm(false)} />
      ) : (
        <Button variant="primary" onClick={() => setShowForm(true)}>
          + Athlet hinzufügen
        </Button>
      )}
    </div>
  )
}

function NewAthleteForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [gender, setGender] = useState<Gender>('Männlich')
  const [age, setAge] = useState(30)
  const [heightCm, setHeightCm] = useState(180)
  const [weightKg, setWeightKg] = useState(80)
  const [activityLevel, setActivityLevel] = useState(ACTIVITY_LEVELS[2].label)
  const [goal, setGoal] = useState(GOALS[1].label)

  async function submit() {
    if (!name.trim()) return
    await createAthlete({
      name: name.trim(),
      gender,
      age,
      heightCm,
      weightKg,
      activityLevel,
      goal,
      proteinPerKg: 2.2,
      fatPerKg: 1,
      startDate: isoDate(new Date()),
    })
    onDone()
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
      <div className="flex gap-2">
        <Button variant="primary" onClick={submit} className="flex-1">
          Anlegen
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Abbrechen
        </Button>
      </div>
    </Card>
  )
}
