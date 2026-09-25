import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { caloriesFromMacros } from '../lib/calculator'
import { GRAM_PRESETS, macroLine, sumMacros, type Sums } from '../lib/macros'
import { findExistingFood, onlineFoodName, type OnlineFood } from '../lib/openFoodFacts'
import { importOnlineFood, useOnlineFoodSearch } from '../lib/useOnlineFoodSearch'
import {
  SERVING_PRESETS,
  formatServings,
  recipeFactor,
  recipeFactorFromGrams,
  recipeWeight,
  scaleGrams,
  servingsLabel,
  servingsOf,
} from '../lib/recipes'
import type { FoodItem, MealType, NutritionPlan } from '../models/types'
import { MEAL_TYPES } from '../models/types'
import QuickAddFood from './QuickAddFood'
import Sheet from './Sheet'
import { Button, DecimalInput, Field, Input, ListRow, SegmentedControl, Select, SourceBadge, UnconfirmedBadge } from './ui'

function macrosFor(food: Pick<FoodItem, 'protein' | 'carbs' | 'fat'>, grams: number): Sums {
  const f = grams / 100
  const protein = food.protein * f
  const carbs = food.carbs * f
  const fat = food.fat * f
  return { kcal: caloriesFromMacros(protein, carbs, fat), protein, carbs, fat }
}

function kcalPer100(food: Pick<FoodItem, 'protein' | 'carbs' | 'fat'>): string {
  return `${Math.round(caloriesFromMacros(food.protein, food.carbs, food.fat))} kcal`
}

type Selection =
  | { kind: 'food'; food: FoodItem }
  | { kind: 'online'; online: OnlineFood }
  | { kind: 'recipe'; recipe: NutritionPlan }
  | { kind: 'create' }

/**
 * Hinzufügen eines Lebensmittels oder Rezepts in zwei Schritten: suchen (eigene Datenbank,
 * Rezepte und Open Food Facts in einer Liste), dann Menge wählen. Ersetzt die leeren Zeilen,
 * die vorher angelegt und erst hinterher über ein Suchfeld gefüllt wurden.
 */
export default function AddFoodSheet({
  open,
  onClose,
  title,
  foods,
  recipes = [],
  mealType,
  showMealType = true,
  onAddFood,
  onAddRecipe,
}: {
  open: boolean
  onClose: () => void
  title: string
  foods: FoodItem[]
  recipes?: NutritionPlan[]
  mealType: MealType
  showMealType?: boolean
  onAddFood: (foodItemId: string, grams: number, mealType: MealType) => Promise<void> | void
  onAddRecipe?: (recipe: NutritionPlan, factor: number, mealType: MealType) => Promise<void> | void
}) {
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [grams, setGrams] = useState<number | undefined>(100)
  const [servings, setServings] = useState<number | undefined>(1)
  const [recipeUnit, setRecipeUnit] = useState<'servings' | 'grams'>('servings')
  const [targetMeal, setTargetMeal] = useState<MealType>(mealType)
  const [saving, setSaving] = useState(false)

  // Jedes Öffnen beginnt mit einer leeren Suche in der Mahlzeit, von der aus geöffnet wurde.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelection(null)
    setGrams(100)
    setServings(1)
    setRecipeUnit('servings')
    setTargetMeal(mealType)
  }, [open, mealType])

  const online = useOnlineFoodSearch(query, open && selection === null)

  const q = query.trim().toLowerCase()
  const localMatches = useMemo(() => {
    const matched = q ? foods.filter((f) => f.name.toLowerCase().includes(q)) : foods
    return [...matched]
      .sort((a, b) => Number(b.favorite ?? false) - Number(a.favorite ?? false) || a.name.localeCompare(b.name, 'de'))
      .slice(0, q ? 30 : 15)
  }, [foods, q])
  const recipeMatches = recipes.filter((r) => !q || r.phaseName.toLowerCase().includes(q))
  // Online-Treffer, die es schon in der eigenen Datenbank gibt, stehen dort bereits.
  const onlineMatches = online.results.filter((o) => !findExistingFood(foods, o))

  const selectedRecipe = selection?.kind === 'recipe' ? selection.recipe : undefined
  const recipeMeals = useLiveQuery(
    () => (selectedRecipe ? db.planMeals.where('planId').equals(selectedRecipe.id).sortBy('order') : []),
    [selectedRecipe?.id],
  )
  const foodMap = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods])

  function back() {
    setSelection(null)
  }

  async function confirm() {
    if (!selection || saving) return
    setSaving(true)
    try {
      if (selection.kind === 'recipe') {
        if (!onAddRecipe || !recipeFactorValue) return
        await onAddRecipe(selection.recipe, recipeFactorValue, targetMeal)
      } else if (selection.kind === 'food' || selection.kind === 'online') {
        if (!grams || grams <= 0) return
        const id = selection.kind === 'food' ? selection.food.id : await importOnlineFood(selection.online)
        await onAddFood(id, grams, targetMeal)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  // --- Mengen-Schritt ---------------------------------------------------------------
  const weight = selectedRecipe ? recipeWeight(selectedRecipe, recipeMeals ?? []) : 0
  const recipeFactorValue = selectedRecipe
    ? recipeUnit === 'servings'
      ? recipeFactor(selectedRecipe, servings ?? 0)
      : recipeFactorFromGrams(weight, grams ?? 0)
    : 0
  const recipePreview = sumMacros(
    (recipeMeals ?? []).map((m) => {
      const food = foodMap.get(m.foodItemId)
      return food ? macrosFor(food, scaleGrams(m.grams, recipeFactorValue)) : { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    }),
  )

  const selectedMacros =
    selection?.kind === 'food' ? selection.food : selection?.kind === 'online' ? selection.online : undefined
  const selectedName =
    selection?.kind === 'food'
      ? selection.food.name
      : selection?.kind === 'online'
        ? onlineFoodName(selection.online)
        : selection?.kind === 'recipe'
          ? selection.recipe.phaseName
          : 'Neues Lebensmittel'

  const canConfirm =
    selection?.kind === 'recipe'
      ? recipeFactorValue > 0 && (recipeMeals?.length ?? 0) > 0
      : (selection?.kind === 'food' || selection?.kind === 'online') && (grams ?? 0) > 0

  const mealSelect = showMealType && (
    <Field label="Mahlzeit">
      <Select value={targetMeal} onChange={(e) => setTargetMeal(e.target.value as MealType)}>
        {MEAL_TYPES.map((mt) => (
          <option key={mt} value={mt}>
            {mt}
          </option>
        ))}
      </Select>
    </Field>
  )

  let body
  if (selection === null) {
    body = (
      <>
        <Input
          autoFocus
          type="search"
          placeholder="Lebensmittel oder Rezept suchen …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Suchen"
        />

        {recipeMatches.length > 0 && onAddRecipe && (
          <ResultSection title="Rezepte">
            {recipeMatches.map((r) => (
              <ListRow
                key={r.id}
                title={r.phaseName}
                subtitle={`Rezept · ergibt ${servingsLabel(servingsOf(r))}`}
                value="›"
                onClick={() => setSelection({ kind: 'recipe', recipe: r })}
              />
            ))}
          </ResultSection>
        )}

        <ResultSection title={q ? 'Meine Lebensmittel' : 'Favoriten & zuletzt angelegt'}>
          {localMatches.length === 0 && <p className="px-1 text-sm text-muted">Keine Treffer in deiner Datenbank.</p>}
          {localMatches.map((f) => (
            <ListRow
              key={f.id}
              title={
                <>
                  {f.favorite && '⭐ '}
                  {f.name}
                  {f.unconfirmed && <UnconfirmedBadge />}
                </>
              }
              subtitle={`P ${Math.round(f.protein)} · C ${Math.round(f.carbs)} · F ${Math.round(f.fat)} je 100 g`}
              value={kcalPer100(f)}
              onClick={() => setSelection({ kind: 'food', food: f })}
            />
          ))}
        </ResultSection>

        {online.active && (
          <ResultSection title="Online · Open Food Facts">
            {online.loading && <p className="px-1 text-sm text-muted">Suche online …</p>}
            {online.error && <p className="px-1 text-sm text-muted">Online-Suche gerade nicht erreichbar.</p>}
            {!online.loading && !online.error && onlineMatches.length === 0 && (
              <p className="px-1 text-sm text-muted">Keine weiteren Online-Treffer.</p>
            )}
            {onlineMatches.map((o) => (
              <ListRow
                key={o.barcode}
                title={onlineFoodName(o)}
                subtitle={`P ${Math.round(o.protein)} · C ${Math.round(o.carbs)} · F ${Math.round(o.fat)} je 100 g`}
                value={`${o.kcal} kcal`}
                onClick={() => setSelection({ kind: 'online', online: o })}
              />
            ))}
          </ResultSection>
        )}

        <Button variant="ghost" onClick={() => setSelection({ kind: 'create' })}>
          + Eigenes Lebensmittel anlegen
        </Button>
      </>
    )
  } else if (selection.kind === 'create') {
    body = (
      <>
        <BackLink onClick={back} />
        <QuickAddFood
          query={query}
          title="Neues Lebensmittel (Werte je 100 g):"
          onCreated={async (id) => {
            const food = await db.foodItems.get(id)
            if (food) setSelection({ kind: 'food', food })
          }}
        />
      </>
    )
  } else if (selection.kind === 'recipe') {
    body = (
      <>
        <BackLink onClick={back} />
        <div>
          <p className="text-base font-semibold text-fg">{selection.recipe.phaseName}</p>
          <p className="text-xs text-muted">
            Ganzes Rezept: {servingsLabel(servingsOf(selection.recipe))} · {Math.round(weight)} g
            {selection.recipe.cookedWeightG ? ' (fertig)' : ' (Summe der Zutaten)'}
          </p>
        </div>
        <SegmentedControl
          size="sm"
          options={[
            { key: 'servings', label: 'Portionen' },
            { key: 'grams', label: 'Gramm' },
          ]}
          value={recipeUnit}
          onChange={setRecipeUnit}
        />
        {recipeUnit === 'servings' ? (
          <AmountInput
            value={servings}
            onChange={setServings}
            presets={SERVING_PRESETS}
            format={formatServings}
            unit="Port."
            label="Portionen"
          />
        ) : (
          <AmountInput value={grams} onChange={setGrams} presets={GRAM_PRESETS} unit="g" label="Menge in Gramm" />
        )}
        {mealSelect}
        <Preview sums={recipePreview} empty={(recipeMeals?.length ?? 0) === 0 ? 'Dieses Rezept hat noch keine Zutaten.' : undefined} />
      </>
    )
  } else {
    body = (
      <>
        <BackLink onClick={back} />
        <div>
          <p className="text-base font-semibold text-fg">
            {selectedName}
            {selection.kind === 'online' && <SourceBadge label="Open Food Facts" />}
          </p>
          {selectedMacros && (
            <p className="text-xs text-muted">
              je 100 g: {kcalPer100(selectedMacros)} · P {selectedMacros.protein} · C {selectedMacros.carbs} · F {selectedMacros.fat}
            </p>
          )}
        </div>
        <AmountInput value={grams} onChange={setGrams} presets={GRAM_PRESETS} unit="g" label="Menge in Gramm" />
        {mealSelect}
        {selectedMacros && <Preview sums={macrosFor(selectedMacros, grams ?? 0)} />}
      </>
    )
  }

  return (
    <Sheet
      open={open}
      title={title}
      onClose={onClose}
      tall
      footer={
        selection && selection.kind !== 'create' ? (
          <Button variant="primary" disabled={!canConfirm || saving} onClick={() => void confirm()}>
            Hinzufügen
          </Button>
        ) : undefined
      }
    >
      {body}
    </Sheet>
  )
}

function ResultSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="px-1 text-xs font-medium uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  )
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="self-start text-sm text-muted hover:text-fg">
      ← Zurück zur Suche
    </button>
  )
}

function Preview({ sums, empty }: { sums: Sums; empty?: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
      {empty ? <span className="text-muted">{empty}</span> : <span className="tabular-nums text-fg">{macroLine(sums)}</span>}
    </div>
  )
}

/** Zahlenfeld mit Schnellauswahl - für Gramm wie für Portionen. */
export function AmountInput({
  value,
  onChange,
  presets,
  unit,
  label,
  format = (n: number) => String(n),
}: {
  value: number | undefined
  onChange: (n: number | undefined) => void
  presets: number[]
  unit: string
  label: string
  format?: (n: number) => string
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <DecimalInput value={value} onChange={onChange} aria-label={label} className="text-base" />
        <span className="shrink-0 text-sm text-muted">{unit}</span>
      </div>
      <div className="flex gap-1.5">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-pressed={value === p}
            className={`flex-1 rounded-lg border py-1.5 text-xs transition active:scale-95 ${
              value === p ? 'border-fg bg-fg/10 font-medium text-fg' : 'border-border text-muted'
            }`}
          >
            {format(p)}
            {unit === 'g' ? ' g' : ''}
          </button>
        ))}
      </div>
    </div>
  )
}
