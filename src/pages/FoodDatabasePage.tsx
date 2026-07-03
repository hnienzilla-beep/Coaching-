import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { Button, Card, DecimalInput, Field, Input } from '../components/ui'
import type { FoodItem } from '../models/types'

export default function FoodDatabasePage() {
  const foods = useLiveQuery(() => db.foodItems.orderBy('name').toArray(), [])
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)

  const filtered = useMemo(() => {
    if (!foods) return []
    const q = query.trim().toLowerCase()
    return q ? foods.filter((f) => f.name.toLowerCase().includes(q)) : foods
  }, [foods, query])

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-4 pb-10">
      <header className="flex items-center gap-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link to="/" className="text-muted">
          ←
        </Link>
        <div>
          <h1 className="text-lg font-bold text-fg">Lebensmittel-Datenbank</h1>
          <p className="text-xs text-muted">{foods?.length ?? 0} Einträge · Werte je 100 g</p>
        </div>
      </header>

      <Input placeholder="Suchen..." value={query} onChange={(e) => setQuery(e.target.value)} />

      {showForm ? (
        <NewFoodForm onDone={() => setShowForm(false)} />
      ) : (
        <Button variant="primary" onClick={() => setShowForm(true)}>
          + Lebensmittel hinzufügen
        </Button>
      )}

      <div className="flex flex-col gap-2">
        {filtered.map((f) => (
          <FoodRow key={f.id} food={f} />
        ))}
      </div>
    </div>
  )
}

function FoodRow({ food }: { food: FoodItem }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(food)

  if (!editing) {
    return (
      <Card className="flex items-center justify-between py-2">
        <div>
          <div className="text-sm font-medium text-fg">{food.name}</div>
          <div className="text-xs text-muted">
            {food.kcal} kcal · P {food.protein}g · C {food.carbs}g · F {food.fat}g
          </div>
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
      <div className="grid grid-cols-4 gap-2">
        <Field label="kcal">
          <DecimalInput value={form.kcal} onChange={(n) => setForm({ ...form, kcal: n ?? 0 })} />
        </Field>
        <Field label="Protein">
          <DecimalInput value={form.protein} onChange={(n) => setForm({ ...form, protein: n ?? 0 })} />
        </Field>
        <Field label="Carbs">
          <DecimalInput value={form.carbs} onChange={(n) => setForm({ ...form, carbs: n ?? 0 })} />
        </Field>
        <Field label="Fett">
          <DecimalInput value={form.fat} onChange={(n) => setForm({ ...form, fat: n ?? 0 })} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          onClick={async () => {
            await db.foodItems.update(food.id, form)
            setEditing(false)
          }}
        >
          Speichern
        </Button>
        <Button
          variant="danger"
          onClick={async () => {
            if (confirm(`"${food.name}" wirklich löschen?`)) {
              await db.foodItems.delete(food.id)
            }
          }}
        >
          Löschen
        </Button>
      </div>
    </Card>
  )
}

function NewFoodForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: '', kcal: 0, protein: 0, carbs: 0, fat: 0 })

  async function submit() {
    if (!form.name.trim()) return
    await db.foodItems.add({ id: crypto.randomUUID(), ...form, name: form.name.trim() })
    onDone()
  }

  return (
    <Card className="flex flex-col gap-2">
      <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
      <div className="grid grid-cols-4 gap-2">
        <Field label="kcal">
          <DecimalInput value={form.kcal} onChange={(n) => setForm({ ...form, kcal: n ?? 0 })} />
        </Field>
        <Field label="Protein">
          <DecimalInput value={form.protein} onChange={(n) => setForm({ ...form, protein: n ?? 0 })} />
        </Field>
        <Field label="Carbs">
          <DecimalInput value={form.carbs} onChange={(n) => setForm({ ...form, carbs: n ?? 0 })} />
        </Field>
        <Field label="Fett">
          <DecimalInput value={form.fat} onChange={(n) => setForm({ ...form, fat: n ?? 0 })} />
        </Field>
      </div>
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
