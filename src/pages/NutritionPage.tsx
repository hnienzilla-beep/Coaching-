import { useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, exportNutritionPlan, importNutritionPlan } from '../db/db'
import { calculate } from '../lib/calculator'
import { shareOrDownloadFile } from '../lib/share'
import type { Athlete, MealType, PlanMeal } from '../models/types'
import { MEAL_TYPES } from '../models/types'
import { Button, Card, Select } from '../components/ui'
import SearchPicker from '../components/SearchPicker'

type Ctx = { athlete: Athlete }

const CAL_TOLERANCE = 100
const MACRO_TOLERANCE = 15

type Row = { meal: PlanMeal; kcal: number; protein: number; carbs: number; fat: number }

export default function NutritionPage() {
  const { athlete } = useOutletContext<Ctx>()
  const plans = useLiveQuery(() => db.nutritionPlans.where('athleteId').equals(athlete.id).sortBy('order'), [athlete.id])
  const foods = useLiveQuery(() => db.foodItems.toArray(), [])
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const importInputRef = useRef<HTMLInputElement>(null)

  const currentPlanId = activePlanId ?? plans?.[0]?.id ?? null
  const activePlan = plans?.find((p) => p.id === currentPlanId)

  const meals = useLiveQuery(
    () => (currentPlanId ? db.planMeals.where('planId').equals(currentPlanId).sortBy('order') : []),
    [currentPlanId],
  )

  const foodMap = new Map((foods ?? []).map((f) => [f.id, f]))
  const foodPickerItems = (foods ?? []).map((f) => ({ id: f.id, label: f.name, sublabel: `${f.kcal} kcal/100g` }))
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

  const rows: Row[] = (meals ?? []).map((m) => {
    const food = foodMap.get(m.foodItemId)
    const factor = m.grams / 100
    return {
      meal: m,
      kcal: food ? food.kcal * factor : 0,
      protein: food ? food.protein * factor : 0,
      carbs: food ? food.carbs * factor : 0,
      fat: food ? food.fat * factor : 0,
    }
  })

  const sums = rows.reduce(
    (acc, r) => ({ kcal: acc.kcal + r.kcal, protein: acc.protein + r.protein, carbs: acc.carbs + r.carbs, fat: acc.fat + r.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )

  async function addPhase() {
    const order = plans?.length ?? 0
    const id = crypto.randomUUID()
    await db.nutritionPlans.add({ id, athleteId: athlete.id, phaseName: `Phase ${order + 1}`, order })
    setActivePlanId(id)
  }

  async function deletePhase(planId: string) {
    await db.planMeals.where('planId').equals(planId).delete()
    await db.nutritionPlans.delete(planId)
    setActivePlanId(null)
  }

  async function renamePhase(planId: string, name: string) {
    await db.nutritionPlans.update(planId, { phaseName: name })
  }

  async function addRow() {
    if (!currentPlanId || !foods?.length) return
    const meal: PlanMeal = {
      id: crypto.randomUUID(),
      planId: currentPlanId,
      mealType: MEAL_TYPES[0],
      foodItemId: foods[0].id,
      grams: 100,
      order: meals?.length ?? 0,
    }
    await db.planMeals.add(meal)
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {plans?.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePlanId(p.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
              p.id === currentPlanId ? 'bg-accent text-black font-medium' : 'bg-surface-2 text-muted'
            }`}
          >
            {p.phaseName}
          </button>
        ))}
        <button onClick={addPhase} className="shrink-0 rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted">
          + Phase
        </button>
      </div>

      {activePlan && mode === 'view' && (
        <NutritionOverview
          phaseName={activePlan.phaseName}
          rows={rows}
          foodMap={foodMap}
          sums={sums}
          target={target}
          onEdit={() => setMode('edit')}
        />
      )}

      {activePlan && mode === 'edit' && (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input
              value={activePlan.phaseName}
              onChange={(e) => renamePhase(activePlan.id, e.target.value)}
              className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm font-semibold text-fg outline-none focus:border-accent"
            />
            {plans && plans.length > 1 && (
              <Button variant="danger" onClick={() => deletePhase(activePlan.id)}>
                Phase löschen
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {rows.map(({ meal }) => (
              <div key={meal.id} className="flex flex-col gap-2 rounded-lg border border-border p-2">
                <SearchPicker
                  items={foodPickerItems}
                  value={meal.foodItemId}
                  onChange={(id) => db.planMeals.update(meal.id, { foodItemId: id })}
                  placeholder="Lebensmittel suchen..."
                />
                <div className="flex items-center gap-2">
                  <Select
                    value={meal.mealType}
                    onChange={(e) => db.planMeals.update(meal.id, { mealType: e.target.value as MealType })}
                    className="flex-1"
                  >
                    {MEAL_TYPES.map((mt) => (
                      <option key={mt} value={mt}>
                        {mt}
                      </option>
                    ))}
                  </Select>
                  <input
                    type="number"
                    value={meal.grams}
                    onChange={(e) => db.planMeals.update(meal.id, { grams: Number(e.target.value) })}
                    placeholder="Gramm"
                    className="w-20 min-w-0 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm text-fg outline-none focus:border-accent"
                  />
                  <Button variant="ghost" onClick={() => db.planMeals.delete(meal.id)}>
                    ✕
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button variant="secondary" onClick={addRow}>
            + Zeile hinzufügen
          </Button>

          <SumTable sums={sums} target={target} />

          <Button variant="primary" onClick={() => setMode('view')}>
            Fertig
          </Button>
        </Card>
      )}

      {activePlan && (
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

function NutritionOverview({
  phaseName,
  rows,
  foodMap,
  sums,
  target,
  onEdit,
}: {
  phaseName: string
  rows: Row[]
  foodMap: Map<string, { name: string }>
  sums: { kcal: number; protein: number; carbs: number; fat: number }
  target: ReturnType<typeof calculate>
  onEdit: () => void
}) {
  const groups = MEAL_TYPES.map((mealType) => {
    const groupRows = rows.filter((r) => r.meal.mealType === mealType)
    const groupSum = groupRows.reduce(
      (acc, r) => ({ kcal: acc.kcal + r.kcal, protein: acc.protein + r.protein, carbs: acc.carbs + r.carbs, fat: acc.fat + r.fat }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    )
    return { mealType, rows: groupRows, sum: groupSum }
  }).filter((g) => g.rows.length > 0)

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{phaseName}</h2>
        <Button variant="secondary" onClick={onEdit}>
          Bearbeiten
        </Button>
      </div>

      {groups.length === 0 && <p className="text-sm text-muted">Noch keine Mahlzeiten in dieser Phase.</p>}

      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.mealType}>
            <div className="flex items-center justify-between pb-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-accent">{group.mealType}</div>
              <div className="text-xs text-muted">
                {group.sum.kcal.toFixed(0)} kcal · P {group.sum.protein.toFixed(1)} g · C {group.sum.carbs.toFixed(1)} g · F{' '}
                {group.sum.fat.toFixed(1)} g
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {group.rows.map(({ meal }) => (
                <FoodRow key={meal.id} meal={meal} foodName={foodMap.get(meal.foodItemId)?.name} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <SumTable sums={sums} target={target} />
    </Card>
  )
}

function FoodRow({ meal, foodName }: { meal: PlanMeal; foodName?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
      <span className="text-fg">{foodName ?? '–'}</span>
      <span className="text-muted">{meal.grams} g</span>
    </div>
  )
}

function diffTone(diff: number, tolerance: number): 'ok' | 'danger' {
  return Math.abs(diff) <= tolerance ? 'ok' : 'danger'
}

function SumTable({
  sums,
  target,
}: {
  sums: { kcal: number; protein: number; carbs: number; fat: number }
  target: ReturnType<typeof calculate>
}) {
  const diffKcal = sums.kcal - target.targetCalories
  const diffProtein = sums.protein - target.proteinG
  const diffCarbs = sums.carbs - target.carbsG
  const diffFat = sums.fat - target.fatG

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-muted">
          <th></th>
          <th>Kcal</th>
          <th>Protein</th>
          <th>Carbs</th>
          <th>Fett</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="text-muted">Summe (Ist)</td>
          <td>{sums.kcal.toFixed(0)}</td>
          <td>{sums.protein.toFixed(0)}</td>
          <td>{sums.carbs.toFixed(0)}</td>
          <td>{sums.fat.toFixed(0)}</td>
        </tr>
        <tr>
          <td className="text-muted">Ziel</td>
          <td>{target.targetCalories}</td>
          <td>{target.proteinG}</td>
          <td>{target.carbsG}</td>
          <td>{target.fatG}</td>
        </tr>
        <tr className="font-medium">
          <td className="text-muted">Differenz</td>
          <td className={diffTone(diffKcal, CAL_TOLERANCE) === 'ok' ? 'text-ok' : 'text-danger'}>{diffKcal.toFixed(0)}</td>
          <td className={diffTone(diffProtein, MACRO_TOLERANCE) === 'ok' ? 'text-ok' : 'text-danger'}>{diffProtein.toFixed(0)}</td>
          <td className={diffTone(diffCarbs, MACRO_TOLERANCE) === 'ok' ? 'text-ok' : 'text-danger'}>{diffCarbs.toFixed(0)}</td>
          <td className={diffTone(diffFat, MACRO_TOLERANCE) === 'ok' ? 'text-ok' : 'text-danger'}>{diffFat.toFixed(0)}</td>
        </tr>
      </tbody>
    </table>
  )
}
