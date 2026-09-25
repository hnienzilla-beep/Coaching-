import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { findByName } from '../lib/names'
import { Button, Field, Input, ListRow, Select } from '../components/ui'
import Sheet from '../components/Sheet'
import type { Supplement, SupplementTiming } from '../models/types'
import { SUPPLEMENT_TIMINGS } from '../models/types'

type Draft = { name: string; defaultDose: string; defaultTiming: SupplementTiming; notes: string }

export default function SupplementDatabasePage() {
  const supplements = useLiveQuery(() => db.supplements.orderBy('name').toArray(), [])
  const [query, setQuery] = useState('')
  // null = zu, 'new' = anlegen, sonst der bearbeitete Eintrag
  const [editing, setEditing] = useState<Supplement | 'new' | null>(null)

  const filtered = useMemo(() => {
    if (!supplements) return []
    const q = query.trim().toLowerCase()
    return q ? supplements.filter((s) => s.name.toLowerCase().includes(q)) : supplements
  }, [supplements, query])

  return (
    <div className="mx-auto flex h-full max-w-md flex-col gap-4 overflow-y-auto overscroll-contain p-4 pb-10">
      <header className="flex items-center gap-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link to="/" className="text-muted" aria-label="Zurück">
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-fg">Supplemente</h1>
          <p className="text-xs text-muted">{supplements?.length ?? 0} Einträge</p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}>
          + Neu
        </Button>
      </header>

      <Input type="search" placeholder="Suchen …" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Supplement suchen" />

      <div className="flex flex-col gap-1.5">
        {filtered.length === 0 && <p className="px-1 text-sm text-muted">Keine Treffer.</p>}
        {filtered.map((s) => (
          <ListRow
            key={s.id}
            title={s.name}
            subtitle={[s.defaultTiming, s.notes].filter(Boolean).join(' · ')}
            value={s.defaultDose}
            onClick={() => setEditing(s)}
            ariaLabel={`${s.name} bearbeiten`}
          />
        ))}
      </div>

      <SupplementSheet
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        supplement={editing}
        initialName={query.trim()}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

function SupplementSheet({
  supplement,
  initialName,
  onClose,
}: {
  supplement: Supplement | 'new' | null
  initialName: string
  onClose: () => void
}) {
  const existing = supplement && supplement !== 'new' ? supplement : undefined
  const [form, setForm] = useState<Draft>(
    existing
      ? { name: existing.name, defaultDose: existing.defaultDose, defaultTiming: existing.defaultTiming, notes: existing.notes ?? '' }
      : { name: initialName, defaultDose: '', defaultTiming: SUPPLEMENT_TIMINGS[0], notes: '' },
  )
  const [error, setError] = useState<string | null>(null)

  if (!supplement) return null

  async function save() {
    const name = form.name.trim()
    if (!name) return
    const duplicate = findByName(await db.supplements.toArray(), name)
    if (duplicate && duplicate.id !== existing?.id) {
      setError(`„${duplicate.name}" steht schon in der Datenbank.`)
      return
    }
    const values = { name, defaultDose: form.defaultDose, defaultTiming: form.defaultTiming, notes: form.notes || undefined }
    if (existing) await db.supplements.update(existing.id, values)
    else await db.supplements.add({ id: crypto.randomUUID(), ...values })
    onClose()
  }

  async function remove() {
    if (!existing) return
    if (!confirm(`„${existing.name}" wirklich löschen?`)) return
    await db.supplements.delete(existing.id)
    onClose()
  }

  return (
    <Sheet
      open
      title={existing ? 'Supplement bearbeiten' : 'Neues Supplement'}
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
      <div className="grid grid-cols-2 gap-2">
        <Field label="Standard-Dosis">
          <Input placeholder="z.B. 5 g" value={form.defaultDose} onChange={(e) => setForm({ ...form, defaultDose: e.target.value })} />
        </Field>
        <Field label="Standard-Zeitpunkt">
          <Select value={form.defaultTiming} onChange={(e) => setForm({ ...form, defaultTiming: e.target.value as SupplementTiming })}>
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
      {error && <p className="text-xs text-danger">{error}</p>}
    </Sheet>
  )
}
