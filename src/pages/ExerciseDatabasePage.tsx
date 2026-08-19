import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { findByName } from '../lib/names'
import { Button, Card, Field, Input, Select } from '../components/ui'
import { fileToResizedDataUrl } from '../lib/image'
import type { Exercise, MuscleGroup } from '../models/types'
import { MUSCLE_GROUPS } from '../models/types'

// Bild-Auswahl mit Vorschau für eine Übung. Skaliert das gewählte Bild herunter und
// gibt die Data-URL über onChange zurück; undefined entfernt das Bild wieder.
function ImageField({ value, onChange }: { value?: string; onChange: (dataUrl: string | undefined) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    try {
      onChange(await fileToResizedDataUrl(file))
    } catch {
      alert('Bild konnte nicht verarbeitet werden.')
    }
  }

  return (
    <Field label="Bild">
      <div className="flex items-center gap-3">
        {value && <img src={value} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void handleFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <Button variant="secondary" onClick={() => inputRef.current?.click()}>
          {value ? 'Ändern' : 'Bild wählen'}
        </Button>
        {value && (
          <Button variant="ghost" onClick={() => onChange(undefined)}>
            Entfernen
          </Button>
        )}
      </div>
    </Field>
  )
}

export default function ExerciseDatabasePage() {
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), [])
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)

  const filtered = useMemo(() => {
    if (!exercises) return []
    const q = query.trim().toLowerCase()
    const matched = q ? exercises.filter((e) => e.name.toLowerCase().includes(q)) : exercises
    return [...matched].sort((a, b) => Number(b.favorite ?? false) - Number(a.favorite ?? false))
  }, [exercises, query])

  return (
    <div className="mx-auto flex h-full max-w-md flex-col gap-4 overflow-y-auto overscroll-contain p-4 pb-10">
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
        <div className="flex items-center gap-3">
          {exercise.imageDataUrl && (
            <img src={exercise.imageDataUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
          )}
          <div>
            <div className="text-sm font-medium text-fg">{exercise.name}</div>
            <div className="text-xs text-muted">{exercise.muscleGroup}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => db.exercises.update(exercise.id, { favorite: !exercise.favorite })}
            aria-label={exercise.favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
            className="px-1 text-lg"
          >
            {exercise.favorite ? '⭐' : '☆'}
          </button>
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Bearbeiten
          </Button>
        </div>
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
      <ImageField value={form.imageDataUrl} onChange={(imageDataUrl) => setForm({ ...form, imageDataUrl })} />
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
  const [form, setForm] = useState<{ name: string; muscleGroup: MuscleGroup; imageDataUrl?: string }>({
    name: '',
    muscleGroup: MUSCLE_GROUPS[0],
  })

  async function submit() {
    const name = form.name.trim()
    if (!name) return
    if (findByName(await db.exercises.toArray(), name)) {
      alert(`„${name}" steht schon in der Datenbank.`)
      return
    }
    await db.exercises.add({
      id: crypto.randomUUID(),
      name,
      muscleGroup: form.muscleGroup,
      imageDataUrl: form.imageDataUrl,
    })
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
      <ImageField value={form.imageDataUrl} onChange={(imageDataUrl) => setForm({ ...form, imageDataUrl })} />
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
