import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { findByName } from '../lib/names'
import { findExistingFood, onlineFoodName } from '../lib/openFoodFacts'
import { importOnlineFood, useOnlineFoodSearch } from '../lib/useOnlineFoodSearch'
import { Button, DecimalInput, Field, Input, ListRow, MacroChips, SourceBadge, UnconfirmedBadge } from '../components/ui'
import Sheet from '../components/Sheet'
import { caloriesFromMacros } from '../lib/calculator'
import type { FoodItem } from '../models/types'

type Draft = { name: string; protein: number; carbs: number; fat: number }

/**
 * Eigene Lebensmittel-Datenbank. Eine Suche über beides: die eigenen Einträge und - ab drei
 * Zeichen - Open Food Facts, deren Treffer sich mit einem Tipp übernehmen lassen. Bearbeiten
 * und Anlegen laufen über dasselbe Sheet, die Liste bleibt einzeilig.
 */
export default function FoodDatabasePage() {
  const foods = useLiveQuery(() => db.foodItems.orderBy('name').toArray(), [])
  const [query, setQuery] = useState('')
  // null = zu, 'new' = anlegen, sonst der bearbeitete Eintrag
  const [editing, setEditing] = useState<FoodItem | 'new' | null>(null)
  const [imported, setImported] = useState<Set<string>>(new Set())
  const online = useOnlineFoodSearch(query)

  const filtered = useMemo(() => {
    if (!foods) return []
    const q = query.trim().toLowerCase()
    const matched = q ? foods.filter((f) => f.name.toLowerCase().includes(q)) : foods
    return [...matched].sort((a, b) => Number(b.favorite ?? false) - Number(a.favorite ?? false))
  }, [foods, query])

  const onlineMatches = online.results.filter((o) => !findExistingFood(foods ?? [], o))

  return (
    <div className="anim-page mx-auto flex h-full max-w-md flex-col gap-4 overflow-y-auto overscroll-contain p-4 pb-10">
      <header className="flex items-center gap-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link to="/" className="text-muted" aria-label="Zurück">
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-fg">Lebensmittel</h1>
          <p className="text-xs text-muted">{foods?.length ?? 0} Einträge · Werte je 100 g</p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}>
          + Neu
        </Button>
      </header>

      <Input
        type="search"
        placeholder="Suchen – auch online bei Open Food Facts"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Lebensmittel suchen"
      />

      <section className="flex flex-col gap-1.5">
        <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted">Meine Lebensmittel</h2>
        {filtered.length === 0 && <p className="px-1 text-sm text-muted">Keine Treffer.</p>}
        {filtered.map((f) => (
          <ListRow
            key={f.id}
            title={
              <>
                {f.name}
                {f.unconfirmed && <UnconfirmedBadge />}
                {f.source === 'off' && <SourceBadge label="OFF" />}
              </>
            }
            subtitle={<MacroChips protein={f.protein} carbs={f.carbs} fat={f.fat} />}
            value={`${Math.round(caloriesFromMacros(f.protein, f.carbs, f.fat))} kcal`}
            onClick={() => setEditing(f)}
            ariaLabel={`${f.name} bearbeiten`}
            trailing={
              <button
                type="button"
                onClick={() => db.foodItems.update(f.id, { favorite: !f.favorite })}
                aria-label={f.favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
                className="shrink-0 px-1 text-lg"
              >
                {f.favorite ? '⭐' : '☆'}
              </button>
            }
          />
        ))}
      </section>

      {online.active && (
        <section className="flex flex-col gap-1.5">
          <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted">Online · Open Food Facts</h2>
          {online.loading && <p className="px-1 text-sm text-muted">Suche online …</p>}
          {online.error && (
              <p className="px-1 text-sm text-muted">
                Online-Suche gerade nicht erreichbar.{' '}
                <button type="button" onClick={online.retry} className="underline hover:text-fg">
                  Nochmal versuchen
                </button>
              </p>
            )}
          {!online.loading && !online.error && onlineMatches.length === 0 && (
            <p className="px-1 text-sm text-muted">Keine weiteren Online-Treffer.</p>
          )}
          {onlineMatches.map((o) => (
            <ListRow
              key={o.barcode}
              title={onlineFoodName(o)}
              subtitle={<MacroChips protein={o.protein} carbs={o.carbs} fat={o.fat} />}
              value={`${o.kcal} kcal`}
              trailing={
                <Button
                  variant="secondary"
                  className="shrink-0 px-3 text-base leading-none"
                  disabled={imported.has(o.barcode)}
                  aria-label={`${onlineFoodName(o)} übernehmen`}
                  onClick={async () => {
                    await importOnlineFood(o)
                    setImported((prev) => new Set(prev).add(o.barcode))
                  }}
                >
                  +
                </Button>
              }
            />
          ))}
        </section>
      )}

      <FoodSheet
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        food={editing}
        initialName={query.trim()}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

/** Anlegen und Bearbeiten in einem Formular - Werte je 100 g, kcal aus den Makros. */
function FoodSheet({ food, initialName, onClose }: { food: FoodItem | 'new' | null; initialName: string; onClose: () => void }) {
  const isNew = food === 'new'
  const existing = food && food !== 'new' ? food : undefined
  const [form, setForm] = useState<Draft>(
    existing
      ? { name: existing.name, protein: existing.protein, carbs: existing.carbs, fat: existing.fat }
      : { name: initialName, protein: 0, carbs: 0, fat: 0 },
  )
  const [error, setError] = useState<string | null>(null)

  if (!food) return null

  async function save() {
    const name = form.name.trim()
    if (!name) return
    const duplicate = findByName(await db.foodItems.toArray(), name)
    if (duplicate && duplicate.id !== existing?.id) {
      setError(`„${duplicate.name}" steht schon in der Datenbank.`)
      return
    }
    const values = { ...form, name, kcal: caloriesFromMacros(form.protein, form.carbs, form.fat) }
    if (existing) {
      // Der Nutzer hat die Werte gesehen und bestätigt - der Schätzwert-Hinweis kann weg.
      await db.foodItems.update(existing.id, { ...values, unconfirmed: undefined })
    } else {
      await db.foodItems.add({ id: crypto.randomUUID(), ...values })
    }
    onClose()
  }

  async function remove() {
    if (!existing) return
    if (!confirm(`„${existing.name}" wirklich löschen?`)) return
    await db.foodItems.delete(existing.id)
    onClose()
  }

  return (
    <Sheet
      open
      title={isNew ? 'Neues Lebensmittel' : 'Lebensmittel bearbeiten'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {existing && (
            <Button variant="danger" onClick={() => void remove()}>
              Löschen
            </Button>
          )}
          <Button variant="primary" className="flex-1" disabled={!form.name.trim()} onClick={() => void save()}>
            {isNew ? 'Anlegen' : 'Speichern'}
          </Button>
        </div>
      }
    >
      <Field label="Name">
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus={isNew} />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Protein g">
          <DecimalInput value={form.protein} onChange={(n) => setForm({ ...form, protein: n ?? 0 })} />
        </Field>
        <Field label="Carbs g">
          <DecimalInput value={form.carbs} onChange={(n) => setForm({ ...form, carbs: n ?? 0 })} />
        </Field>
        <Field label="Fett g">
          <DecimalInput value={form.fat} onChange={(n) => setForm({ ...form, fat: n ?? 0 })} />
        </Field>
      </div>
      <p className="text-xs text-muted">
        {Math.round(caloriesFromMacros(form.protein, form.carbs, form.fat))} kcal je 100 g (aus Makros berechnet)
      </p>
      {existing?.source === 'off' && (
        <p className="text-xs text-muted">
          Übernommen aus Open Food Facts{existing.barcode ? ` · Barcode ${existing.barcode}` : ''}.
        </p>
      )}
      {existing?.unconfirmed && (
        <p className="text-xs text-muted">
          Geschätzte Werte aus dem Vault – beim Speichern gelten sie als geprüft und die Markierung „unbestätigt“
          verschwindet.
        </p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </Sheet>
  )
}
