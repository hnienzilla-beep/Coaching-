import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { caloriesFromMacros } from '../lib/calculator'
import { macroLine, sumMacros, type Sums } from '../lib/macros'
import {
  DEFAULT_PORTIONS,
  parsePortionList,
  saveStandardPortions,
  suggestPortions,
  useFoodPortionHistory,
  useStandardPortions,
} from '../lib/portionPresets'
import { findExistingFood, lookupBarcode, normalizeBarcode, onlineFoodName, type OnlineFood } from '../lib/openFoodFacts'
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
import BarcodeScanner from './BarcodeScanner'
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
  | { kind: 'scan' }

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
  // Barcode: 'scanning' = Kamera läuft, sonst das Ergebnis der Nachfrage bei Open Food Facts.
  const [scan, setScan] = useState<{ status: 'scanning' | 'loading' | 'notfound' | 'error'; code?: string }>({
    status: 'scanning',
  })

  // Jedes Öffnen beginnt mit einer leeren Suche in der Mahlzeit, von der aus geöffnet wurde.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelection(null)
    setGrams(100)
    setServings(1)
    setRecipeUnit('servings')
    setTargetMeal(mealType)
    prefilledFor.current = null
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

  // Mengen-Vorschläge: für ein eigenes Lebensmittel zuerst die gewohnten Mengen, die häufigste
  // ist beim Auswählen gleich vorbelegt (einmal je Lebensmittel, danach zählt die eigene Eingabe).
  const standards = useStandardPortions()
  const selectedFoodId = selection?.kind === 'food' ? selection.food.id : undefined
  const history = useFoodPortionHistory(selectedFoodId)
  const selectedFood = selection?.kind === 'food' ? (foodMap.get(selection.food.id) ?? selection.food) : undefined
  const suggestion = suggestPortions(history ?? [], standards, selectedFood?.portions)
  const prefilledFor = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedFoodId || history === undefined || prefilledFor.current === selectedFoodId) return
    prefilledFor.current = selectedFoodId
    setGrams(suggestion.preferred ?? 100)
  }, [selectedFoodId, history, suggestion.preferred])

  function back() {
    setSelection(null)
  }

  function startScan() {
    setScan({ status: 'scanning' })
    setSelection({ kind: 'scan' })
  }

  /**
   * Gescannter Barcode: zuerst in der eigenen Datenbank (schon einmal übernommen), sonst bei
   * Open Food Facts - ein Treffer landet direkt bei der Mengenwahl.
   */
  async function handleBarcode(raw: string) {
    const code = normalizeBarcode(raw) ?? raw
    const own = foods.find((f) => f.barcode === code)
    if (own) {
      setSelection({ kind: 'food', food: own })
      return
    }
    setScan({ status: 'loading', code })
    try {
      const online = await lookupBarcode(code)
      if (!online) {
        setScan({ status: 'notfound', code })
        return
      }
      const existing = findExistingFood(foods, online)
      setSelection(existing ? { kind: 'food', food: existing } : { kind: 'online', online })
    } catch {
      setScan({ status: 'error', code })
    }
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
        <div className="flex gap-2">
          <Input
            autoFocus
            type="search"
            placeholder="Lebensmittel oder Rezept suchen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Suchen"
          />
          <button
            type="button"
            onClick={startScan}
            aria-label="Barcode scannen"
            title="Barcode scannen"
            className="flex shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 px-3 text-fg transition hover:border-accent active:scale-95"
          >
            <BarcodeIcon />
          </button>
        </div>

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

        <ResultSection title="Meine Lebensmittel">
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
  } else if (selection.kind === 'scan') {
    body = (
      <>
        <BackLink onClick={back} />
        {scan.status === 'scanning' ? (
          <BarcodeScanner onCode={(code) => void handleBarcode(code)} />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface-2 px-4 py-6 text-center">
            <p className="text-xs tabular-nums text-muted">Barcode {scan.code}</p>
            <p className="text-sm text-fg">
              {scan.status === 'loading'
                ? 'Suche bei Open Food Facts …'
                : scan.status === 'notfound'
                  ? 'Dieses Produkt kennt Open Food Facts nicht (oder ohne vollständige Nährwerte).'
                  : 'Open Food Facts ist gerade nicht erreichbar.'}
            </p>
            {scan.status !== 'loading' && (
              <div className="flex w-full gap-2">
                <Button variant="secondary" className="flex-1" onClick={startScan}>
                  Nochmal scannen
                </Button>
                {scan.status === 'notfound' ? (
                  <Button variant="primary" className="flex-1" onClick={() => setSelection({ kind: 'create' })}>
                    Selbst anlegen
                  </Button>
                ) : (
                  <Button variant="primary" className="flex-1" onClick={() => scan.code && void handleBarcode(scan.code)}>
                    Erneut versuchen
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
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
          <AmountInput value={grams} onChange={setGrams} presets={standards} editableStandards unit="g" label="Menge in Gramm" />
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
        <AmountInput
          value={grams}
          onChange={setGrams}
          presets={suggestion.presets}
          learned={suggestion.learned}
          editableStandards
          food={selectedFood}
          unit="g"
          label="Menge in Gramm"
        />
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
        selection && selection.kind !== 'create' && selection.kind !== 'scan' ? (
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

function BarcodeIcon() {
  return (
    <svg width="22" height="18" viewBox="0 0 22 18" fill="currentColor" aria-hidden="true">
      <rect x="1" y="2" width="2" height="14" rx="0.5" />
      <rect x="5" y="2" width="1" height="14" />
      <rect x="8" y="2" width="2.5" height="14" rx="0.5" />
      <rect x="12.5" y="2" width="1" height="14" />
      <rect x="15.5" y="2" width="2" height="14" rx="0.5" />
      <rect x="19.5" y="2" width="1.5" height="14" />
    </svg>
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

/** Lebensmittel, dessen eigene Mengen der ✎-Editor bearbeitet. */
export type PortionTarget = { id: string; name: string; portions?: number[] }

/**
 * Zahlenfeld mit Schnellauswahl - für Gramm wie für Portionen. Gelernte Mengen (aus den
 * bisherigen Einträgen) tragen einen Punkt. Mit `editableStandards` öffnet ✎ einen Editor:
 * mit `food` für die Mengen genau dieses Lebensmittels, sonst für die Standard-Mengen.
 */
export function AmountInput({
  value,
  onChange,
  presets,
  learned = [],
  editableStandards = false,
  food,
  unit,
  label,
  format = (n: number) => String(n),
}: {
  value: number | undefined
  onChange: (n: number | undefined) => void
  presets: number[]
  learned?: number[]
  editableStandards?: boolean
  food?: PortionTarget
  unit: string
  label: string
  format?: (n: number) => string
}) {
  const [editing, setEditing] = useState(false)
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
            title={learned.includes(p) ? 'Hast du schon öfter eingetragen' : undefined}
            className={`relative flex-1 rounded-lg border py-1.5 text-xs transition active:scale-95 ${
              value === p ? 'border-fg bg-fg/10 font-medium text-fg' : 'border-border text-muted'
            }`}
          >
            {format(p)}
            {unit === 'g' ? ' g' : ''}
            {learned.includes(p) && (
              <span aria-hidden="true" className="absolute top-1 right-1 h-1 w-1 rounded-full bg-accent" />
            )}
          </button>
        ))}
        {editableStandards && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-label={food ? `Mengen für ${food.name} anpassen` : 'Standard-Mengen anpassen'}
            aria-expanded={editing}
            className="shrink-0 rounded-lg border border-border px-2.5 text-xs text-muted transition hover:text-fg active:scale-95"
          >
            ✎
          </button>
        )}
      </div>
      {editing && <PortionsEditor food={food} current={presets} onDone={() => setEditing(false)} />}
    </div>
  )
}

/**
 * Mengen als Komma-Liste bearbeiten - mit `food` die eigenen Mengen dieses Lebensmittels
 * (gespeichert am Eintrag), sonst die Standard-Mengen für alle auf diesem Gerät.
 */
function PortionsEditor({ food, current, onDone }: { food?: PortionTarget; current: number[]; onDone: () => void }) {
  const [text, setText] = useState(() => current.join(', '))
  const parsed = parsePortionList(text)
  const hasOwn = !!food?.portions?.length

  async function save() {
    if (food) await db.foodItems.update(food.id, { portions: parsed })
    else saveStandardPortions(parsed)
    onDone()
  }

  async function reset() {
    if (food) await db.foodItems.update(food.id, { portions: undefined })
    else saveStandardPortions(DEFAULT_PORTIONS)
    onDone()
  }

  return (
    <div className="anim-pop flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        {food ? `Mengen für ${food.name} in g` : 'Standard-Mengen in g'} (mit Komma oder Leerzeichen getrennt, bis zu 6)
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          inputMode="decimal"
          aria-label={food ? 'Eigene Mengen' : 'Standard-Mengen'}
        />
      </label>
      <p className="text-[11px] text-muted">
        {food
          ? 'Gilt nur für dieses Lebensmittel. Ohne eigene Mengen stehen vorne deine häufigsten Mengen (mit Punkt), aufgefüllt mit den Standard-Mengen.'
          : 'Vorne stehen immer die Mengen, die du von einem Lebensmittel am häufigsten einträgst (mit Punkt) – aufgefüllt mit diesen.'}
      </p>
      <div className="flex gap-2">
        {(!food || hasOwn) && (
          <Button variant="ghost" className="flex-1" onClick={() => void reset()}>
            {food ? 'Automatisch' : 'Zurücksetzen'}
          </Button>
        )}
        <Button variant="primary" className="flex-1" disabled={parsed.length === 0} onClick={() => void save()}>
          Speichern
        </Button>
      </div>
      {food && (
        <button
          type="button"
          disabled={parsed.length === 0}
          onClick={() => {
            saveStandardPortions(parsed)
            onDone()
          }}
          className="self-center text-[11px] text-muted underline disabled:opacity-40"
        >
          Stattdessen als Standard für alle Lebensmittel übernehmen
        </button>
      )}
    </div>
  )
}
