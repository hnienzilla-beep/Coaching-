import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { findByName } from '../lib/names'
import { Button, Card, DecimalInput, Field, Input, UnconfirmedBadge } from '../components/ui'
import { caloriesFromMacros } from '../lib/calculator'
import type { FoodItem } from '../models/types'

export default function FoodDatabasePage() {
  const foods = useLiveQuery(() => db.foodItems.orderBy('name').toArray(), [])
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)

  const filtered = useMemo(() => {
    if (!foods) return []
    const q = query.trim().toLowerCase()
    const matched = q ? foods.filter((f) => f.name.toLowerCase().includes(q)) : foods
    return [...matched].sort((a, b) => Number(b.favorite ?? false) - Number(a.favorite ?? false))
  }, [foods, query])

  return (
    <div className="mx-auto flex h-full max-w-md flex-col gap-4 overflow-y-auto overscroll-contain p-4 pb-10">
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
          <div className="text-sm font-medium text-fg">
            {food.name}
            {food.unconfirmed && <UnconfirmedBadge />}
          </div>
          <div className="text-xs text-muted">
            {Math.round(caloriesFromMacros(food.protein, food.carbs, food.fat))} kcal · P {food.protein}g · C {food.carbs}g · F{' '}
            {food.fat}g
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => db.foodItems.update(food.id, { favorite: !food.favorite })}
            aria-label={food.favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
            className="px-1 text-lg"
          >
            {food.favorite ? '⭐' : '☆'}
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
      <div className="grid grid-cols-3 gap-2">
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
      <p className="text-xs text-muted">{Math.round(caloriesFromMacros(form.protein, form.carbs, form.fat))} kcal (aus Makros berechnet)</p>
      {food.unconfirmed && (
        <p className="text-xs text-muted">
          Geschätzte Werte aus dem Vault – beim Speichern gelten sie als geprüft und die Markierung „unbestätigt"
          verschwindet.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          onClick={async () => {
            await db.foodItems.update(food.id, {
              ...form,
              kcal: caloriesFromMacros(form.protein, form.carbs, form.fat),
              // Der Nutzer hat die Werte gesehen und bestätigt - der Schätzwert-Hinweis kann weg.
              unconfirmed: undefined,
            })
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
  const [form, setForm] = useState({ name: '', protein: 0, carbs: 0, fat: 0 })

  async function submit() {
    const name = form.name.trim()
    if (!name) return
    if (findByName(await db.foodItems.toArray(), name)) {
      alert(`„${name}" steht schon in der Datenbank.`)
      return
    }
    await db.foodItems.add({
      id: crypto.randomUUID(),
      ...form,
      name,
      kcal: caloriesFromMacros(form.protein, form.carbs, form.fat),
    })
    onDone()
  }

  return (
    <Card className="flex flex-col gap-2">
      <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
      <div className="grid grid-cols-3 gap-2">
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
      <p className="text-xs text-muted">{Math.round(caloriesFromMacros(form.protein, form.carbs, form.fat))} kcal (aus Makros berechnet)</p>
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
