import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { Button, Card, Field, Input, Select } from '../components/ui'
import type { Supplement, SupplementTiming } from '../models/types'
import { SUPPLEMENT_TIMINGS } from '../models/types'

export default function SupplementDatabasePage() {
  const supplements = useLiveQuery(() => db.supplements.orderBy('name').toArray(), [])
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)

  const filtered = useMemo(() => {
    if (!supplements) return []
    const q = query.trim().toLowerCase()
    return q ? supplements.filter((s) => s.name.toLowerCase().includes(q)) : supplements
  }, [supplements, query])

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-4 pb-10">
      <header className="flex items-center gap-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link to="/" className="text-muted">
          ←
        </Link>
        <div>
          <h1 className="text-lg font-bold text-fg">Supplement-Datenbank</h1>
          <p className="text-xs text-muted">{supplements?.length ?? 0} Einträge</p>
        </div>
      </header>

      <Input placeholder="Suchen..." value={query} onChange={(e) => setQuery(e.target.value)} />

      {showForm ? (
        <NewSupplementForm onDone={() => setShowForm(false)} />
      ) : (
        <Button variant="primary" onClick={() => setShowForm(true)}>
          + Supplement hinzufügen
        </Button>
      )}

      <div className="flex flex-col gap-2">
        {filtered.map((s) => (
          <SupplementRow key={s.id} supplement={s} />
        ))}
      </div>
    </div>
  )
}

function SupplementRow({ supplement }: { supplement: Supplement }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(supplement)

  if (!editing) {
    return (
      <Card className="flex items-center justify-between py-2">
        <div>
          <div className="text-sm font-medium text-fg">{supplement.name}</div>
          <div className="text-xs text-muted">
            {supplement.defaultDose} · {supplement.defaultTiming}
          </div>
          {supplement.notes && <div className="text-xs text-muted">{supplement.notes}</div>}
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
      <div className="grid grid-cols-2 gap-2">
        <Field label="Standard-Dosis">
          <Input value={form.defaultDose} onChange={(e) => setForm({ ...form, defaultDose: e.target.value })} />
        </Field>
        <Field label="Standard-Zeitpunkt">
          <Select
            value={form.defaultTiming}
            onChange={(e) => setForm({ ...form, defaultTiming: e.target.value as SupplementTiming })}
          >
            {SUPPLEMENT_TIMINGS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Hinweis (optional)">
        <Input value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </Field>
      <div className="flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          onClick={async () => {
            await db.supplements.update(supplement.id, form)
            setEditing(false)
          }}
        >
          Speichern
        </Button>
        <Button
          variant="danger"
          onClick={async () => {
            if (confirm(`"${supplement.name}" wirklich löschen?`)) {
              await db.supplements.delete(supplement.id)
            }
          }}
        >
          Löschen
        </Button>
      </div>
    </Card>
  )
}

function NewSupplementForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState<{ name: string; defaultDose: string; defaultTiming: SupplementTiming; notes: string }>({
    name: '',
    defaultDose: '',
    defaultTiming: SUPPLEMENT_TIMINGS[0],
    notes: '',
  })

  async function submit() {
    if (!form.name.trim()) return
    await db.supplements.add({
      id: crypto.randomUUID(),
      name: form.name.trim(),
      defaultDose: form.defaultDose,
      defaultTiming: form.defaultTiming,
      notes: form.notes || undefined,
    })
    onDone()
  }

  return (
    <Card className="flex flex-col gap-2">
      <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Standard-Dosis">
          <Input
            placeholder="z.B. 5 g"
            value={form.defaultDose}
            onChange={(e) => setForm({ ...form, defaultDose: e.target.value })}
          />
        </Field>
        <Field label="Standard-Zeitpunkt">
          <Select
            value={form.defaultTiming}
            onChange={(e) => setForm({ ...form, defaultTiming: e.target.value as SupplementTiming })}
          >
            {SUPPLEMENT_TIMINGS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Hinweis (optional)">
        <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
