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
import { Button, Card, DecimalInput, Field, ListRow, MacroChips, SectionHeader, SegmentedControl } from '../components/ui'
import AddFoodSheet from '../components/AddFoodSheet'
import PortionEditSheet from '../components/PortionEditSheet'
import CollapsibleCard from '../components/CollapsibleCard'
import MacroBars from '../components/MacroBars'
import MacroSumTable from '../components/MacroSumTable'
import PlanPhaseHeader from '../components/PlanPhaseHeader'
import { macroLine, scaleMacros, sumMacros, type Sums } from '../lib/macros'
import { useCoachMode } from '../lib/detailLevel'
import { useDragSensors } from '../lib/dragSensors'
import { recipeWeight, servingsLabel, servingsOf } from '../lib/recipes'

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
  // Hinzufügen und Bearbeiten laufen über Sheets - die Liste selbst bleibt einzeilig.
  const [addMeal, setAddMeal] = useState<MealType | null>(null)
  const [editMealId, setEditMealId] = useState<string | null>(null)
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

  async function setCookedWeight(planId: string, grams: number | undefined) {
    await db.nutritionPlans.update(planId, { cookedWeightG: grams && grams > 0 ? grams : undefined })
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
    setMode('edit')
  }

  function cancelEdit() {
    setDraftMeals(null)
    setMode('view')
  }

  function addDraftFood(foodItemId: string, grams: number, mealType: MealType) {
    if (!currentPlanId) return
    setDraftMeals((prev) => [
      ...(prev ?? []),
      { id: crypto.randomUUID(), planId: currentPlanId, mealType, foodItemId, grams, order: nextOrder(prev ?? []) },
    ])
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
  const weight = activePlan && isRecipeView ? recipeWeight(activePlan, visibleMeals) : 0
  const per100 = weight > 0 ? scaleMacros(sums, 100 / weight) : null
  const editMeal = editMealId ? (draftMeals ?? []).find((m) => m.id === editMealId) : undefined

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        options={[
          { key: 'plan', label: 'Tagespläne' },
          { key: 'recipe', label: 'Rezepte' },
        ]}
        value={kind}
        onChange={(k) => {
          setKind(k)
          cancelEdit()
        }}
      />

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
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Ergibt Portionen">
                    <DecimalInput
                      value={servingsOf(activePlan)}
                      onChange={(v) => void setServings(activePlan.id, v ?? 1)}
                    />
                  </Field>
                  <Field label="Fertiggewicht (g)">
                    <DecimalInput
                      value={activePlan.cookedWeightG}
                      onChange={(v) => void setCookedWeight(activePlan.id, v)}
                      placeholder={`${Math.round(recipeWeight({}, visibleMeals))} (Zutaten)`}
                    />
                  </Field>
                </div>
                <p className="text-xs text-muted">
                  Die Zutaten beschreiben den ganzen Ansatz. Im Log fügst du dann Portionen oder Gramm ein. Das
                  Fertiggewicht ist optional: Wiegst du das fertige Gericht, stimmen die Gramm-Angaben auch nach dem
                  Kochen.
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
                    <span className="shrink-0 whitespace-nowrap text-muted">Ganzes Rezept</span>
                    <span className="text-right text-fg">{macroLine(sums)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="shrink-0 whitespace-nowrap text-muted">Je Portion</span>
                    <span className="text-right font-medium text-fg">{macroLine(perServing)}</span>
                  </div>
                  {per100 && (
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="shrink-0 whitespace-nowrap text-muted">Je 100 g</span>
                      <span className="text-right text-fg">{macroLine(per100)}</span>
                    </div>
                  )}
                  {weight > 0 && (
                    <p className="text-xs text-muted">
                      Gesamtgewicht {Math.round(weight)} g {activePlan?.cookedWeightG ? '(fertig gewogen)' : '(Summe der Zutaten)'}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Bilanz der Phase</h2>
                <MacroBars sums={sums} target={target} remainingText={planRemainingText} />
                {coachMode && (
                  <CollapsibleCard title="Details (Ist / Ziel / Differenz)" variant="plain" defaultExpanded={false}>
                    <MacroSumTable sums={sums} target={target} />
                  </CollapsibleCard>
                )}
              </>
            )}
          </Card>

          {groups.length === 0 && (
            <p className="px-1 text-center text-sm text-muted">
              {isRecipeView ? 'Noch keine Zutaten in diesem Rezept.' : 'Noch keine Mahlzeiten in dieser Phase.'}
              {coachMode && !editing ? ' Tippe oben auf „Bearbeiten“, um zu planen.' : ''}
            </p>
          )}

          {groups.map((group) => (
            <section key={group.key} className="flex flex-col gap-1.5">
              <SectionHeader
                title={group.label}
                meta={`${Math.round(group.sum.kcal)} kcal`}
                action={
                  editing ? (
                    <button
                      type="button"
                      onClick={() => setAddMeal(group.mealType)}
                      aria-label={`${isRecipeView ? 'Zutat' : `Lebensmittel zu ${group.label}`} hinzufügen`}
                      className="rounded-full px-2.5 py-0.5 text-lg leading-none text-muted hover:text-fg"
                    >
                      +
                    </button>
                  ) : undefined
                }
              />

              {editing ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(e) => handleDragEndInGroup(group.rows.map((r) => r.meal), e)}
                >
                  <SortableContext items={group.rows.map((r) => r.meal.id)} strategy={verticalListSortingStrategy}>
                    {group.rows.map((row) => (
                      <SortableMealRow
                        key={row.meal.id}
                        row={row}
                        foodName={foodMap.get(row.meal.foodItemId)?.name}
                        onEdit={() => setEditMealId(row.meal.id)}
                        onRemove={() => removeDraftMeal(row.meal.id)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              ) : (
                group.rows.map((row) => (
                  <ListRow
                    key={row.meal.id}
                    title={foodMap.get(row.meal.foodItemId)?.name ?? '–'}
                    subtitle={
                      <>
                        {row.meal.grams} g · <MacroChips protein={row.protein} carbs={row.carbs} fat={row.fat} />
                      </>
                    }
                    value={`${Math.round(row.kcal)} kcal`}
                  />
                ))
              )}
            </section>
          ))}

          {editing && (
            <div className="flex flex-col gap-2">
              <Button variant="secondary" onClick={() => setAddMeal(isRecipeView ? recipeRowMealType : mealTypeForTime())}>
                {isRecipeView ? '+ Zutat hinzufügen' : '+ Lebensmittel hinzufügen'}
              </Button>
              <Button variant="ghost" onClick={cancelEdit}>
                Änderungen verwerfen
              </Button>
            </div>
          )}
        </>
      )}

      <AddFoodSheet
        open={addMeal !== null}
        onClose={() => setAddMeal(null)}
        title={isRecipeView ? 'Zutat hinzufügen' : 'Lebensmittel hinzufügen'}
        foods={foods ?? []}
        mealType={addMeal ?? mealTypeForTime()}
        showMealType={!isRecipeView}
        onAddFood={addDraftFood}
      />

      <PortionEditSheet
        entry={editMeal ?? null}
        food={editMeal ? foodMap.get(editMeal.foodItemId) : undefined}
        showMealType={!isRecipeView}
        onSave={(grams, mealType) => editMeal && updateDraftMeal(editMeal.id, { grams, mealType })}
        onRemove={() => editMeal && removeDraftMeal(editMeal.id)}
        onClose={() => setEditMealId(null)}
      />

      {activePlan && coachMode && (
        <CollapsibleCard title="Export & Import" defaultExpanded={false}>
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
        </CollapsibleCard>
      )}
    </div>
  )
}

function SortableMealRow({ row, foodName, onEdit, onRemove }: { row: Row; foodName?: string; onEdit: () => void; onRemove: () => void }) {
  const { meal } = row
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: meal.id })

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}>
      <ListRow
        leading={
          <span {...attributes} {...listeners} className="-ml-1 shrink-0 touch-none px-1 text-lg text-muted" aria-label="Verschieben">
            ⠿
          </span>
        }
        title={foodName ?? 'Unbekanntes Lebensmittel'}
        subtitle={`${meal.grams} g`}
        value={`${Math.round(row.kcal)} kcal`}
        onClick={onEdit}
        ariaLabel={`${foodName ?? 'Eintrag'} bearbeiten`}
        onSwipeDelete={onRemove}
      />
    </div>
  )
}
