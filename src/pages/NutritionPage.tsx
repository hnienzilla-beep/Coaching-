import { useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { db, exportNutritionPlan, importNutritionPlan } from '../db/db'
import { calculate, caloriesFromMacros, mealTypeForTime, nextOrder } from '../lib/calculator'
import { shareOrDownloadFile } from '../lib/share'
import type { Athlete, MealType, NutritionPlan, PlanMeal } from '../models/types'
import { MEAL_TYPES } from '../models/types'
import { Button, Card, DecimalInput, Field, Select } from '../components/ui'
import { type SearchPickerItem } from '../components/SearchPicker'
import CollapsibleCard from '../components/CollapsibleCard'
import FoodPortionFields from '../components/FoodPortionFields'
import GroupAddChips from '../components/GroupAddChips'
import MacroBars from '../components/MacroBars'
import MacroSumTable from '../components/MacroSumTable'
import PlanItemRow from '../components/PlanItemRow'
import PlanPhaseHeader from '../components/PlanPhaseHeader'
import { macroLine, scaleMacros, sumMacros, type Sums } from '../lib/macros'
import { useCoachMode } from '../lib/detailLevel'
import { useDragSensors } from '../lib/dragSensors'
import { servingsLabel, servingsOf } from '../lib/recipes'

type Ctx = { athlete: Athlete }

type Row = Sums & { meal: PlanMeal }

/** Im Plan gibt es kein "gegessen" - die Restmenge ist das, was noch zu verplanen ist. */
function planRemainingText(remaining: number): string {
  return remaining >= 0 ? `Noch ${Math.round(remaining)} kcal einzuplanen` : `${Math.round(-remaining)} kcal über dem Ziel`
}

export default function NutritionPage() {
  const { athlete } = useOutletContext<Ctx>()
  const coachMode = useCoachMode()
  const plans = useLiveQuery(() => db.nutritionPlans.where('athleteId').equals(athlete.id).sortBy('order'), [athlete.id])
  const foods = useLiveQuery(() => db.foodItems.toArray(), [])
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  // Tagesplaene und Rezepte teilen sich Tabelle und Seite, aber nie eine Liste: Ein Rezept ist
  // kein Tagesablauf, und die Phasenleiste waere mit einem Dutzend Gerichten unbrauchbar.
  const [kind, setKind] = useState<'plan' | 'recipe'>('plan')
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [draftMeals, setDraftMeals] = useState<PlanMeal[] | null>(null)
  // Frisch angelegte Zeilen starten aufgeklappt - dort fehlt das Lebensmittel noch.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const importInputRef = useRef<HTMLInputElement>(null)
  const sensors = useDragSensors()

  const isRecipeView = kind === 'recipe'
  const visiblePlans = (plans ?? []).filter((p) => !!p.isRecipe === isRecipeView)
  // activePlanId zeigt nach einem Listenwechsel noch auf die andere Liste - dann greift der
  // erste Eintrag der jetzt sichtbaren, sonst staende die Seite leer da.
  const currentPlanId = visiblePlans.find((p) => p.id === activePlanId)?.id ?? visiblePlans[0]?.id ?? null
  const activePlan = visiblePlans.find((p) => p.id === currentPlanId)
  const recipeCount = (plans ?? []).filter((p) => p.isRecipe).length

  const meals = useLiveQuery(
    () => (currentPlanId ? db.planMeals.where('planId').equals(currentPlanId).sortBy('order') : []),
    [currentPlanId],
  )

  // Zahl der Einträge je Phase für die Phasen-Übersicht - eine Abfrage über alle Phasen
  // statt einer je Chip.
  const planIdKey = (plans ?? []).map((p) => p.id).join(',')
  const mealCounts = useLiveQuery(async () => {
    const planIds = planIdKey === '' ? [] : planIdKey.split(',')
    const all = await db.planMeals.where('planId').anyOf(planIds).toArray()
    const counts = new Map<string, number>()
    for (const meal of all) counts.set(meal.planId, (counts.get(meal.planId) ?? 0) + 1)
    return counts
  }, [planIdKey])

  const foodMap = new Map((foods ?? []).map((f) => [f.id, f]))
  const foodPickerItems: SearchPickerItem[] = (foods ?? []).map((f) => ({
    id: f.id,
    label: f.name,
    sublabel: `${Math.round(caloriesFromMacros(f.protein, f.carbs, f.fat))} kcal/100g`,
    favorite: f.favorite,
    unconfirmed: f.unconfirmed,
  }))
  const target = calculate({
    gender: athlete.gender,
    age: athlete.age,
    heightCm: athlete.heightCm,
    weightKg: athlete.weightKg,
    activityLevel: athlete.activityLevel,
    goal: athlete.goal,
    proteinPerKg: athlete.proteinPerKg,
    fatPerKg: athlete.fatPerKg,
    calorieAdjustmentKcal: athlete.calorieAdjustmentKcal,
  })

  function toRows(list: PlanMeal[]): Row[] {
    return list.map((m) => {
      const food = foodMap.get(m.foodItemId)
      const factor = m.grams / 100
      const protein = food ? food.protein * factor : 0
      const carbs = food ? food.carbs * factor : 0
      const fat = food ? food.fat * factor : 0
      return { meal: m, kcal: caloriesFromMacros(protein, carbs, fat), protein, carbs, fat }
    })
  }

  function sortDraftMeals(list: PlanMeal[]): PlanMeal[] {
    return [...list].sort((a, b) => MEAL_TYPES.indexOf(a.mealType) - MEAL_TYPES.indexOf(b.mealType) || a.order - b.order)
  }

  const editing = mode === 'edit' && coachMode
  // Im Bearbeiten-Modus zeigt die Bilanz den Entwurf, damit die Balken beim Planen mitlaufen.
  const visibleMeals = editing ? sortDraftMeals(draftMeals ?? []) : (meals ?? [])
  const rows: Row[] = toRows(visibleMeals)
  const sums = sumMacros(rows)

  // Im Rezept ist die Mahlzeit bedeutungslos - gewählt wird sie erst beim Einfügen ins Log.
  // Die Zeilen behalten trotzdem ihren Mahlzeit-Typ (der Vault-Export braucht einen), stehen
  // hier aber als eine flache Zutatenliste statt unter "### Snack 1".
  const recipeRowMealType: MealType = visibleMeals[visibleMeals.length - 1]?.mealType ?? mealTypeForTime()

  const mealGroups = MEAL_TYPES.map((mealType) => {
    const groupRows = rows.filter((r) => r.meal.mealType === mealType)
    return { key: mealType, label: mealType, mealType, rows: groupRows, sum: sumMacros(groupRows) }
  }).filter((g) => g.rows.length > 0)

  const groups = isRecipeView
    ? rows.length
      ? [{ key: 'zutaten', label: 'Zutaten', mealType: recipeRowMealType, rows, sum: sumMacros(rows) }]
      : []
    : mealGroups

  const usedMealTypes = new Set(mealGroups.map((g) => g.mealType))

  async function addPhase() {
    const order = nextOrder(plans ?? [])
    const id = crypto.randomUUID()
    await db.nutritionPlans.add({
      id,
      athleteId: athlete.id,
      phaseName: isRecipeView ? `Rezept ${recipeCount + 1}` : `Phase ${order + 1}`,
      order,
      ...(isRecipeView ? { isRecipe: true, servings: 1 } : {}),
    })
    setActivePlanId(id)
  }

  /**
   * Umschalten zwischen Tagesplan und Rezept. Die Ansicht wechselt mit, sonst waere die
   * gerade bearbeitete Phase nach dem Haken aus der Liste verschwunden.
   */
  async function setIsRecipe(plan: NutritionPlan, value: boolean) {
    await db.nutritionPlans.update(plan.id, {
      isRecipe: value || undefined,
      servings: value ? servingsOf(plan) : undefined,
    })
    setKind(value ? 'recipe' : 'plan')
    setActivePlanId(plan.id)
  }

  async function setServings(planId: string, servings: number) {
    await db.nutritionPlans.update(planId, { servings: servings > 0 ? servings : 1 })
  }

  /**
   * Umsortieren wirkt nur in der sichtbaren Liste. Statt bei 0 neu zu zählen werden die
   * `order`-Werte neu verteilt, die diese Gruppe ohnehin schon belegt - sonst bekämen
   * Tagespläne und Rezepte dieselben Nummern und lägen im Vault-Export beliebig ineinander.
   */
  async function saveVisibleOrder(orderedIds: string[]) {
    const slots = visiblePlans.map((p) => p.order).sort((a, b) => a - b)
    await db.transaction('rw', db.nutritionPlans, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.nutritionPlans.update(orderedIds[i], { order: slots[i] })
      }
    })
  }

  async function deletePhase(planId: string) {
    await db.planMeals.where('planId').equals(planId).delete()
    await db.nutritionPlans.delete(planId)
    setActivePlanId(null)
    setDraftMeals(null)
    setMode('view')
  }

  async function renamePhase(planId: string, name: string) {
    await db.nutritionPlans.update(planId, { phaseName: name })
  }

  function startEdit() {
    setDraftMeals((meals ?? []).map((m) => ({ ...m })))
    setExpandedIds(new Set())
    setMode('edit')
  }

  function cancelEdit() {
    setDraftMeals(null)
    setMode('view')
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function addDraftRow(mealType: MealType) {
    if (!currentPlanId) return
    const id = crypto.randomUUID()
    setDraftMeals((prev) => [
      ...(prev ?? []),
      { id, planId: currentPlanId, mealType, foodItemId: '', grams: 100, order: nextOrder(prev ?? []) },
    ])
    setExpandedIds((prev) => new Set(prev).add(id))
  }

  function updateDraftMeal(id: string, patch: Partial<PlanMeal>) {
    setDraftMeals((prev) => (prev ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  function removeDraftMeal(id: string) {
    setDraftMeals((prev) => (prev ?? []).filter((m) => m.id !== id))
  }

  // Drag & Drop wirkt nur innerhalb einer Mahlzeit-Typ-Gruppe (mealType ändert sich nie
  // durchs Ziehen, nur über das Dropdown der Zeile) - jede Gruppe bekommt daher ihren
  // eigenen DndContext, dieser Handler reordnet nur die order-Werte innerhalb der
  // übergebenen Gruppen-Teilmenge.
  function handleDragEndInGroup(groupMeals: PlanMeal[], event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = groupMeals.findIndex((m) => m.id === active.id)
    const newIndex = groupMeals.findIndex((m) => m.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(groupMeals, oldIndex, newIndex)
    const orderById = new Map(reordered.map((m, i) => [m.id, i]))
    setDraftMeals((prev) => (prev ?? []).map((m) => (orderById.has(m.id) ? { ...m, order: orderById.get(m.id)! } : m)))
  }

  async function saveDraft() {
    if (!currentPlanId || !draftMeals) {
      setMode('view')
      return
    }
    const finalMeals = sortDraftMeals(draftMeals).filter((m) => m.foodItemId !== '')
    await db.transaction('rw', db.planMeals, async () => {
      await db.planMeals.where('planId').equals(currentPlanId).delete()
      for (let i = 0; i < finalMeals.length; i++) {
        await db.planMeals.add({ ...finalMeals[i], order: i })
      }
    })
    setDraftMeals(null)
    setMode('view')
  }

  async function handleExportPlan() {
    if (!activePlan) return
    const json = await exportNutritionPlan(activePlan.id)
    const file = new File([json], `Ernaehrungsplan-${activePlan.phaseName}.json`, { type: 'application/json' })
    await shareOrDownloadFile(file)
  }

  async function handleImportPlan(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const newPlanId = await importNutritionPlan(text, athlete.id)
      setActivePlanId(newPlanId)
    } catch {
      alert('Import fehlgeschlagen. Ist die Datei eine gültige Ernährungsplan-Vorlage?')
    }
  }

  const entryText = `${rows.length} ${rows.length === 1 ? 'Eintrag' : 'Einträge'}`
  // Beim Rezept sagt die Zahl der Mahlzeiten nichts - es ist ein Gericht. Dort steht
  // stattdessen die Ausbeute, an der die Portionsrechnung im Log haengt.
  const subtitle = isRecipeView
    ? activePlan
      ? `${entryText} · ergibt ${servingsLabel(servingsOf(activePlan))}`
      : undefined
    : groups.length
      ? `${groups.length} ${groups.length === 1 ? 'Mahlzeit' : 'Mahlzeiten'} · ${entryText}`
      : undefined

  const perServing = activePlan && isRecipeView ? scaleMacros(sums, 1 / servingsOf(activePlan)) : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(['plan', 'recipe'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k)
              cancelEdit()
            }}
            aria-pressed={kind === k}
            className={`flex-1 rounded-xl px-3 py-2 text-sm transition active:scale-95 ${
              kind === k
                ? 'bg-accent font-medium text-accent-fg'
                : 'border border-border bg-surface-2 text-muted hover:text-fg'
            }`}
          >
            {k === 'plan' ? 'Tagespläne' : 'Rezepte'}
          </button>
        ))}
      </div>

      <PlanPhaseHeader
        title={isRecipeView ? 'Rezept' : 'Ernährungsplan'}
        phaseNoun={isRecipeView ? 'Rezept' : 'Phase'}
        addLabel={isRecipeView ? '+ Rezept' : '+ Phase'}
        deleteConfirmText={
          isRecipeView ? 'Dieses Rezept mit allen Zutaten löschen?' : 'Diese Phase mit allen Mahlzeiten löschen?'
        }
        phases={visiblePlans.map((p) => ({
          id: p.id,
          phaseName: p.phaseName,
          // Beim Bearbeiten zählt der Entwurf, sonst stünde in der Übersicht eine andere
          // Zahl als in der Zeile darüber.
          count: editing && p.id === currentPlanId ? rows.length : (mealCounts?.get(p.id) ?? 0),
        }))}
        activePhaseId={currentPlanId}
        onSelect={(id) => {
          setActivePlanId(id)
          cancelEdit()
        }}
        onAdd={coachMode ? addPhase : undefined}
        onRename={activePlan ? (name) => renamePhase(activePlan.id, name) : undefined}
        onDelete={
          // Ein Tagesplan muss bleiben (die Seite braucht einen), Rezepte sind optional.
          activePlan && (isRecipeView || visiblePlans.length > 1) ? () => deletePhase(activePlan.id) : undefined
        }
        onReorder={
          coachMode
            ? (ids) => {
                // Ohne gesetztes activePlanId zeigt die Seite die erste Phase - nach dem
                // Verschieben wäre das eine andere, und die gerade bearbeitete Phase wäre weg.
                setActivePlanId(currentPlanId)
                void saveVisibleOrder(ids)
              }
            : undefined
        }
        countLabel={(n) => `${n} ${n === 1 ? 'Eintrag' : 'Einträge'}`}
        subtitle={subtitle}
        editing={editing}
        actions={
          activePlan && coachMode ? (
            editing ? (
              <Button variant="primary" onClick={saveDraft}>
                Fertig
              </Button>
            ) : (
              <Button variant="secondary" onClick={startEdit}>
                Bearbeiten
              </Button>
            )
          ) : undefined
        }
      >
        {editing && activePlan && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <label className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={!!activePlan.isRecipe}
                onChange={(e) => void setIsRecipe(activePlan, e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              Als Rezept verwenden
            </label>
            {activePlan.isRecipe ? (
              <>
                <Field label="Ergibt … Portionen">
                  <DecimalInput
                    value={servingsOf(activePlan)}
                    onChange={(v) => void setServings(activePlan.id, v ?? 1)}
                  />
                </Field>
                <p className="text-xs text-muted">
                  Die Zutaten unten beschreiben den ganzen Ansatz. Im Ernährungslog gibst du dann Portionen ein und
                  bekommst die Zutaten anteilig eingetragen.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted">
                Ein Rezept ist ein Gericht statt eines Tagesablaufs: Es taucht nicht in der Planauswahl des Logs auf,
                sondern lässt sich dort portionsweise einfügen.
              </p>
            )}
          </div>
        )}
      </PlanPhaseHeader>

      {activePlan && (
        <>
          {/* Ein Rezept am Tagesziel zu messen ergibt keinen Sinn - "Noch 2300 kcal einzuplanen"
              stünde sonst unter jedem Eis. Dort zählt, was der Ansatz insgesamt hat und was davon
              auf eine Portion entfällt: die Zahl, die im Log am Ende landet. */}
          <Card className="flex flex-col gap-3">
            {isRecipeView && perServing ? (
              <>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Nährwerte</h2>
                <div className="flex flex-col gap-1 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-muted">Ganzes Rezept</span>
                    <span className="text-right text-fg">{macroLine(sums)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-muted">Je Portion</span>
                    <span className="text-right font-medium text-fg">{macroLine(perServing)}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Bilanz der Phase</h2>
                <MacroBars done={sums} planned={sums} target={target} legend={null} remainingText={planRemainingText} />
                {coachMode && (
                  <CollapsibleCard title="Details (Ist / Ziel / Differenz)" variant="plain" defaultExpanded={false}>
                    <MacroSumTable sums={sums} target={target} />
                  </CollapsibleCard>
                )}
              </>
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            {groups.length === 0 && (
              <p className="text-sm text-muted">
                🍽️ {isRecipeView ? 'Noch keine Zutaten in diesem Rezept.' : 'Noch keine Mahlzeiten in dieser Phase.'}
                {coachMode && !editing ? ' Tippe oben auf „Bearbeiten“, um zu planen.' : ''}
              </p>
            )}

            <div className="flex flex-col gap-4">
              {groups.map((group) => (
                <div key={group.key} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    {/* text-fg statt text-accent: die Athleten-Akzentfarben sind hell und im
                        Hell-Modus als Schrift praktisch unlesbar. */}
                    <div className="text-xs font-semibold uppercase tracking-wide text-fg">{group.label}</div>
                    {editing && (
                      <Button
                        variant="ghost"
                        onClick={() => addDraftRow(group.mealType)}
                        aria-label={`${isRecipeView ? 'Zutat' : `Lebensmittel zu ${group.label}`} hinzufügen`}
                      >
                        {isRecipeView ? '+ Zutat' : '+ Lebensmittel'}
                      </Button>
                    )}
                  </div>
                  <div className="text-[11px] text-muted">{macroLine(group.sum)}</div>

                  {editing ? (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(e) => handleDragEndInGroup(group.rows.map((r) => r.meal), e)}
                    >
                      <SortableContext items={group.rows.map((r) => r.meal.id)} strategy={verticalListSortingStrategy}>
                        <div className="flex flex-col gap-1.5">
                          {group.rows.map((row) => (
                            <SortableMealRow
                              key={row.meal.id}
                              row={row}
                              foodName={foodMap.get(row.meal.foodItemId)?.name}
                              foodPickerItems={foodPickerItems}
                              expanded={expandedIds.has(row.meal.id)}
                              onToggle={() => toggleExpanded(row.meal.id)}
                              onChange={(patch) => updateDraftMeal(row.meal.id, patch)}
                              onRemove={() => removeDraftMeal(row.meal.id)}
                              showMealType={!isRecipeView}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {group.rows.map((row) => (
                        <div
                          key={row.meal.id}
                          className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm"
                        >
                          <span className="min-w-0 flex-1 truncate text-fg">
                            {foodMap.get(row.meal.foodItemId)?.name ?? '–'}
                          </span>
                          <span className="shrink-0 text-muted">{row.meal.grams} g</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {editing &&
              (isRecipeView ? (
                groups.length === 0 && (
                  <Button variant="secondary" onClick={() => addDraftRow(recipeRowMealType)}>
                    + Zutat
                  </Button>
                )
              ) : (
                <GroupAddChips
                  label="Mahlzeit hinzufügen"
                  options={MEAL_TYPES}
                  used={usedMealTypes}
                  onAdd={addDraftRow}
                  highlight={mealTypeForTime()}
                />
              ))}

            {editing && (
              <Button variant="ghost" onClick={cancelEdit}>
                Änderungen verwerfen
              </Button>
            )}
          </Card>
        </>
      )}

      {activePlan && coachMode && (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleExportPlan} className="flex-1">
            Plan exportieren
          </Button>
          <Button variant="secondary" onClick={() => importInputRef.current?.click()} className="flex-1">
            Plan importieren
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              void handleImportPlan(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      )}
    </div>
  )
}

function SortableMealRow({
  row,
  foodName,
  foodPickerItems,
  expanded,
  onToggle,
  onChange,
  onRemove,
  showMealType,
}: {
  row: Row
  foodName?: string
  foodPickerItems: SearchPickerItem[]
  expanded: boolean
  onToggle: () => void
  onChange: (patch: Partial<PlanMeal>) => void
  onRemove: () => void
  showMealType: boolean // im Rezept nicht: die Mahlzeit wird erst beim Einfügen ins Log gewählt
}) {
  const { meal } = row
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: meal.id })

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}>
      <PlanItemRow
        title={foodName ?? 'Lebensmittel wählen …'}
        subtitle={`${meal.grams} g · ${macroLine(row)}`}
        expanded={expanded}
        onToggle={onToggle}
        onDelete={onRemove}
        deleteLabel={`${foodName ?? 'Eintrag'} entfernen`}
        dragHandle={
          <button
            {...attributes}
            {...listeners}
            type="button"
            className="shrink-0 touch-none px-1 text-lg text-muted"
            aria-label="Verschieben"
          >
            ⠿
          </button>
        }
      >
        <FoodPortionFields
          pickerItems={foodPickerItems}
          foodItemId={meal.foodItemId}
          grams={meal.grams}
          onChange={onChange}
        />

        {showMealType && (
          <Field label="Mahlzeit">
            <Select value={meal.mealType} onChange={(e) => onChange({ mealType: e.target.value as MealType })}>
              {MEAL_TYPES.map((mt) => (
                <option key={mt} value={mt}>
                  {mt}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </PlanItemRow>
    </div>
  )
}
