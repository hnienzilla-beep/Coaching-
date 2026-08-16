import { useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { db, exportNutritionPlan, importNutritionPlan } from '../db/db'
import { savePhaseOrder } from '../db/queries'
import { calculate, caloriesFromMacros, mealTypeForTime, nextOrder } from '../lib/calculator'
import { shareOrDownloadFile } from '../lib/share'
import type { Athlete, MealType, PlanMeal } from '../models/types'
import { MEAL_TYPES } from '../models/types'
import { Button, Card, Field, Select } from '../components/ui'
import { type SearchPickerItem } from '../components/SearchPicker'
import CollapsibleCard from '../components/CollapsibleCard'
import FoodPortionFields from '../components/FoodPortionFields'
import GroupAddChips from '../components/GroupAddChips'
import MacroBars from '../components/MacroBars'
import MacroSumTable from '../components/MacroSumTable'
import PlanItemRow from '../components/PlanItemRow'
import PlanPhaseHeader from '../components/PlanPhaseHeader'
import { macroLine, sumMacros, type Sums } from '../lib/macros'
import { useCoachMode } from '../lib/detailLevel'
import { useDragSensors } from '../lib/dragSensors'

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
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [draftMeals, setDraftMeals] = useState<PlanMeal[] | null>(null)
  // Frisch angelegte Zeilen starten aufgeklappt - dort fehlt das Lebensmittel noch.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const importInputRef = useRef<HTMLInputElement>(null)
  const sensors = useDragSensors()

  const currentPlanId = activePlanId ?? plans?.[0]?.id ?? null
  const activePlan = plans?.find((p) => p.id === currentPlanId)

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

  const groups = MEAL_TYPES.map((mealType) => {
    const groupRows = rows.filter((r) => r.meal.mealType === mealType)
    return { mealType, rows: groupRows, sum: sumMacros(groupRows) }
  }).filter((g) => g.rows.length > 0)

  const usedMealTypes = new Set(groups.map((g) => g.mealType))

  async function addPhase() {
    const order = nextOrder(plans ?? [])
    const id = crypto.randomUUID()
    await db.nutritionPlans.add({ id, athleteId: athlete.id, phaseName: `Phase ${order + 1}`, order })
    setActivePlanId(id)
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

  const subtitle = groups.length
    ? `${groups.length} ${groups.length === 1 ? 'Mahlzeit' : 'Mahlzeiten'} · ${rows.length} ${rows.length === 1 ? 'Eintrag' : 'Einträge'}`
    : undefined

  return (
    <div className="flex flex-col gap-4">
      <PlanPhaseHeader
        title="Ernährungsplan"
        phases={(plans ?? []).map((p) => ({
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
        addLabel="+ Phase"
        onRename={activePlan ? (name) => renamePhase(activePlan.id, name) : undefined}
        onDelete={activePlan && plans && plans.length > 1 ? () => deletePhase(activePlan.id) : undefined}
        onReorder={
          coachMode
            ? (ids) => {
                // Ohne gesetztes activePlanId zeigt die Seite die erste Phase - nach dem
                // Verschieben wäre das eine andere, und die gerade bearbeitete Phase wäre weg.
                setActivePlanId(currentPlanId)
                void savePhaseOrder('nutritionPlans', ids)
              }
            : undefined
        }
        countLabel={(n) => `${n} ${n === 1 ? 'Eintrag' : 'Einträge'}`}
        deleteConfirmText="Diese Phase mit allen Mahlzeiten löschen?"
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
      />

      {activePlan && (
        <>
          <Card className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Bilanz der Phase</h2>
            <MacroBars done={sums} planned={sums} target={target} legend={null} remainingText={planRemainingText} />
            {coachMode && (
              <CollapsibleCard title="Details (Ist / Ziel / Differenz)" variant="plain" defaultExpanded={false}>
                <MacroSumTable sums={sums} target={target} />
              </CollapsibleCard>
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            {groups.length === 0 && (
              <p className="text-sm text-muted">
                🍽️ Noch keine Mahlzeiten in dieser Phase.
                {coachMode && !editing ? ' Tippe oben auf „Bearbeiten“, um zu planen.' : ''}
              </p>
            )}

            <div className="flex flex-col gap-4">
              {groups.map((group) => (
                <div key={group.mealType} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    {/* text-fg statt text-accent: die Athleten-Akzentfarben sind hell und im
                        Hell-Modus als Schrift praktisch unlesbar. */}
                    <div className="text-xs font-semibold uppercase tracking-wide text-fg">{group.mealType}</div>
                    {editing && (
                      <Button
                        variant="ghost"
                        onClick={() => addDraftRow(group.mealType)}
                        aria-label={`Lebensmittel zu ${group.mealType} hinzufügen`}
                      >
                        + Lebensmittel
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

            {editing && (
              <GroupAddChips
                label="Mahlzeit hinzufügen"
                options={MEAL_TYPES}
                used={usedMealTypes}
                onAdd={addDraftRow}
                highlight={mealTypeForTime()}
              />
            )}

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
}: {
  row: Row
  foodName?: string
  foodPickerItems: SearchPickerItem[]
  expanded: boolean
  onToggle: () => void
  onChange: (patch: Partial<PlanMeal>) => void
  onRemove: () => void
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

        <Field label="Mahlzeit">
          <Select value={meal.mealType} onChange={(e) => onChange({ mealType: e.target.value as MealType })}>
            {MEAL_TYPES.map((mt) => (
              <option key={mt} value={mt}>
                {mt}
              </option>
            ))}
          </Select>
        </Field>
      </PlanItemRow>
    </div>
  )
}
