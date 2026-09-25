import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { findByName } from '../lib/names'
import { Button, Field, Input, ListRow, Select } from '../components/ui'
import Sheet from '../components/Sheet'
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
  const [group, setGroup] = useState<MuscleGroup | null>(null)
  // null = zu, 'new' = anlegen, sonst die bearbeitete Übung
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null)

  const filtered = useMemo(() => {
    if (!exercises) return []
    const q = query.trim().toLowerCase()
    const matched = exercises.filter((e) => (!q || e.name.toLowerCase().includes(q)) && (!group || e.muscleGroup === group))
    return [...matched].sort((a, b) => Number(b.favorite ?? false) - Number(a.favorite ?? false))
  }, [exercises, query, group])

  // Nur Muskelgruppen als Filter anbieten, zu denen es auch Übungen gibt.
  const groups = MUSCLE_GROUPS.filter((m) => (exercises ?? []).some((e) => e.muscleGroup === m))

  return (
    <div className="anim-page mx-auto flex h-full max-w-md flex-col gap-4 overflow-y-auto overscroll-contain p-4 pb-10">
      <header className="flex items-center gap-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link to="/" className="text-muted" aria-label="Zurück">
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-fg">Übungen</h1>
          <p className="text-xs text-muted">{exercises?.length ?? 0} Einträge</p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}>
          + Neu
        </Button>
      </header>

      <Input type="search" placeholder="Suchen …" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Übung suchen" />

      <div className="-mx-4 flex shrink-0 gap-1.5 overflow-x-auto px-4 pb-0.5">
        {[null, ...groups].map((g) => (
          <button
            key={g ?? 'alle'}
            type="button"
            onClick={() => setGroup(g)}
            aria-pressed={group === g}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition active:scale-95 ${
              group === g ? 'bg-accent font-medium text-accent-fg' : 'border border-border bg-surface-2 text-muted hover:text-fg'
            }`}
          >
            {g ?? 'Alle'}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        {filtered.length === 0 && <p className="px-1 text-sm text-muted">Keine Treffer.</p>}
        {filtered.map((e) => (
          <ListRow
            key={e.id}
            onSwipeDelete={() => db.exercises.delete(e.id)}
            swipeConfirm={`„${e.name}" wirklich löschen?`}
            leading={
              e.imageDataUrl ? (
                <img src={e.imageDataUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg text-lg" aria-hidden="true">
                  🏋️
                </span>
              )
            }
            title={e.name}
            subtitle={e.muscleGroup}
            onClick={() => setEditing(e)}
            ariaLabel={`${e.name} bearbeiten`}
            trailing={
              <button
                type="button"
                onClick={() => db.exercises.update(e.id, { favorite: !e.favorite })}
                aria-label={e.favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
                className="shrink-0 px-1 text-lg"
              >
                {e.favorite ? '⭐' : '☆'}
              </button>
            }
          />
        ))}
      </div>

      <ExerciseSheet
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        exercise={editing}
        initialName={query.trim()}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

function ExerciseSheet({
  exercise,
  initialName,
  onClose,
}: {
  exercise: Exercise | 'new' | null
  initialName: string
  onClose: () => void
}) {
  const existing = exercise && exercise !== 'new' ? exercise : undefined
  const [form, setForm] = useState<{ name: string; muscleGroup: MuscleGroup; imageDataUrl?: string }>(
    existing
      ? { name: existing.name, muscleGroup: existing.muscleGroup, imageDataUrl: existing.imageDataUrl }
      : { name: initialName, muscleGroup: MUSCLE_GROUPS[0] },
  )
  const [error, setError] = useState<string | null>(null)

  if (!exercise) return null

  async function save() {
    const name = form.name.trim()
    if (!name) return
    const duplicate = findByName(await db.exercises.toArray(), name)
    if (duplicate && duplicate.id !== existing?.id) {
      setError(`„${duplicate.name}" steht schon in der Datenbank.`)
      return
    }
    const values = { name, muscleGroup: form.muscleGroup, imageDataUrl: form.imageDataUrl }
    if (existing) await db.exercises.update(existing.id, values)
    else await db.exercises.add({ id: crypto.randomUUID(), ...values })
    onClose()
  }

  async function remove() {
    if (!existing) return
    if (!confirm(`„${existing.name}" wirklich löschen?`)) return
    await db.exercises.delete(existing.id)
    onClose()
  }

  return (
    <Sheet
      open
      title={existing ? 'Übung bearbeiten' : 'Neue Übung'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {existing && (
            <Button variant="danger" onClick={() => void remove()}>
              Löschen
            </Button>
          )}
          <Button variant="primary" className="flex-1" disabled={!form.name.trim()} onClick={() => void save()}>
            {existing ? 'Speichern' : 'Anlegen'}
          </Button>
        </div>
      }
    >
      <Field label="Name">
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus={!existing} />
      </Field>
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
      {error && <p className="text-xs text-danger">{error}</p>}
    </Sheet>
  )
}
