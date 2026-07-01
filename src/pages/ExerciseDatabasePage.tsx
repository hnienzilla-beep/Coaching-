import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { Button, Card, Field, Input, Select } from '../components/ui'
import type { Exercise, MuscleGroup } from '../models/types'
import { MUSCLE_GROUPS } from '../models/types'

export default function ExerciseDatabasePage() {
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), [])
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)

  const filtered = useMemo(() => {
    if (!exercises) return []
    const q = query.trim().toLowerCase()
    return q ? exercises.filter((e) => e.name.toLowerCase().includes(q)) : exercises
  }, [exercises, query])

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-4 pb-10">
      <header className="flex items-center gap-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link to="/" className="text-muted">
          ←
        </Link>
        <div>
          <h1 className="text-lg font-bold text-fg">Trainings-Datenbank</h1>
          <p className="text-xs text-muted">{exercises?.length ?? 0} Übungen</p>
        </div>
      </header>

      <Input placeholder="Suchen..." value={query} onChange={(e) => setQuery(e.target.value)} />

      {showForm ? (
        <NewExerciseForm onDone={() => setShowForm(false)} />
      ) : (
        <Button variant="primary" onClick={() => setShowForm(true)}>
          + Übung hinzufügen
        </Button>
      )}

      <div className="flex flex-col gap-2">
        {filtered.map((e) => (
          <ExerciseRow key={e.id} exercise={e} />
        ))}
      </div>
    </div>
  )
}

function ExerciseRow({ exercise }: { exercise: Exercise }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(exercise)

  if (!editing) {
    return (
      <Card className="flex items-center justify-between py-2">
        <div>
          <div className="text-sm font-medium text-fg">{exercise.name}</div>
          <div className="text-xs text-muted">{exercise.muscleGroup}</div>
        </div>
        <Button variant="ghost" onClick={() => setEditing(true)}>
          Bearbeiten
        </Button>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-2">
      <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Field label="Muskelgruppe">
        <Select value={form.muscleGroup} onChange={(e) => setForm({ ...form, muscleGroup: e.target.value as MuscleGroup })}>
          {MUSCLE_GROUPS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          onClick={async () => {
            await db.exercises.update(exercise.id, form)
            setEditing(false)
          }}
        >
          Speichern
        </Button>
        <Button
          variant="danger"
          onClick={async () => {
            if (confirm(`"${exercise.name}" wirklich löschen?`)) {
              await db.exercises.delete(exercise.id)
            }
          }}
        >
          Löschen
        </Button>
      </div>
    </Card>
  )
}

function NewExerciseForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState<{ name: string; muscleGroup: MuscleGroup }>({
    name: '',
    muscleGroup: MUSCLE_GROUPS[0],
  })

  async function submit() {
    if (!form.name.trim()) return
    await db.exercises.add({ id: crypto.randomUUID(), name: form.name.trim(), muscleGroup: form.muscleGroup })
    onDone()
  }

  return (
    <Card className="flex flex-col gap-2">
      <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
      <Field label="Muskelgruppe">
        <Select value={form.muscleGroup} onChange={(e) => setForm({ ...form, muscleGroup: e.target.value as MuscleGroup })}>
          {MUSCLE_GROUPS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" onClick={submit}>
          Hinzufügen
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Abbrechen
        </Button>
      </div>
    </Card>
  )
}
