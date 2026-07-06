import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { getOrCreateNutritionLog, isoDate, syncNutritionTotalsToDailyEntry } from '../db/queries'
import { calculate, mealTypeForTime } from '../lib/calculator'
import type { Athlete, MealType, NutritionLogItem } from '../models/types'
import { MEAL_TYPES } from '../models/types'
import { Button, Card, Field, Select } from '../components/ui'
import SearchPicker from '../components/SearchPicker'
import { useCoachMode } from '../lib/coachMode'

type Ctx = { athlete: Athlete }

const CAL_TOLERANCE = 100
const MACRO_TOLERANCE = 15

type Row = { item: NutritionLogItem; kcal: number; protein: number; carbs: number; fat: number }
type Sums = { kcal: number; protein: number; carbs: number; fat: number }

function sumRows(rows: Row[]): Sums {
  return rows.reduce(
    (acc, r) => ({ kcal: acc.kcal + r.kcal, protein: acc.protein + r.protein, carbs: acc.carbs + r.carbs, fat: acc.fat + r.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

export default function NutritionLogPage() {
  const { athlete } = useOutletContext<Ctx>()
  const navigate = useNavigate()
  const [coachMode] = useCoachMode()
  const logs = useLiveQuery(() => db.nutritionLogs.where('athleteId').equals(athlete.id).reverse().sortBy('date'), [athlete.id])
  const nutritionPlans = useLiveQuery(() => db.nutritionPlans.where('athleteId').equals(athlete.id).sortBy('order'), [athlete.id])
  const foods = useLiveQuery(() => db.foodItems.toArray(), [])

  const [selectedDate, setSelectedDate] = useState(isoDate(new Date()))
  const currentLog = logs?.find((l) => l.date === selectedDate)

  const items = useLiveQuery(
    () => (currentLog ? db.nutritionLogItems.where('nutritionLogId').equals(currentLog.id).sortBy('order') : []),
    [currentLog?.id],
  )

  const foodMap = new Map((foods ?? []).map((f) => [f.id, f]))
  const foodPickerItems = (foods ?? []).map((f) => ({ id: f.id, label: f.name, sublabel: `${f.kcal} kcal/100g` }))
  const planMap = new Map((nutritionPlans ?? []).map((p) => [p.id, p]))

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

  const rows: Row[] = (items ?? []).map((item) => {
    const food = foodMap.get(item.foodItemId)
    const factor = item.grams / 100
    return {
      item,
      kcal: food ? food.kcal * factor : 0,
      protein: food ? food.protein * factor : 0,
      carbs: food ? food.carbs * factor : 0,
      fat: food ? food.fat * factor : 0,
    }
  })

  const sums = sumRows(rows)
  const doneSums = sumRows(rows.filter((r) => r.item.done))

  // Tracking-Synchronisierung: nur die tatsächlich abgehakten ("gegessenen") Einträge zählen,
  // andere Tracking-Felder (Gewicht, Körpermaße) bleiben unangetastet.
  useEffect(() => {
    if (!currentLog) return
    void syncNutritionTotalsToDailyEntry(athlete.id, selectedDate, {
      calories: doneSums.kcal,
      protein: doneSums.protein,
      carbs: doneSums.carbs,
      fat: doneSums.fat,
    })
  }, [currentLog, athlete.id, selectedDate, doneSums.kcal, doneSums.protein, doneSums.carbs, doneSums.fat])

  const groups = MEAL_TYPES.map((mealType) => {
    const groupRows = rows.filter((r) => r.item.mealType === mealType)
    return { mealType, rows: groupRows, sum: sumRows(groupRows) }
  }).filter((g) => g.rows.length > 0)

  async function addFoodRow() {
    const log = await getOrCreateNutritionLog(athlete.id, selectedDate)
    await db.nutritionLogItems.add({
      id: crypto.randomUUID(),
      nutritionLogId: log.id,
      mealType: mealTypeForTime(),
      foodItemId: '',
      grams: 100,
      order: items?.length ?? 0,
    })
  }

  async function saveLogAsPlan() {
    if (!currentLog || !items?.length) return
    const validItems = items.filter((item) => item.foodItemId !== '')
    if (!validItems.length) return
    const order = nutritionPlans?.length ?? 0
    const planId = crypto.randomUUID()
    await db.transaction('rw', db.nutritionPlans, db.planMeals, async () => {
      await db.nutritionPlans.add({ id: planId, athleteId: athlete.id, phaseName: `Ernährungsplan ${selectedDate}`, order })
      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i]
        await db.planMeals.add({
          id: crypto.randomUUID(),
          planId,
          mealType: item.mealType,
          foodItemId: item.foodItemId,
          grams: item.grams,
          order: i,
        })
      }
    })
    navigate(`/athlete/${athlete.id}/ernaehrung`)
  }

  async function setNutritionPlanId(planId: string) {
    const log = await getOrCreateNutritionLog(athlete.id, selectedDate)
    await db.nutritionLogs.update(log.id, { nutritionPlanId: planId || undefined })
    if (!planId) return

    const planMeals = await db.planMeals.where('planId').equals(planId).sortBy('order')
    await db.transaction('rw', db.nutritionLogItems, async () => {
      const existingItems = await db.nutritionLogItems.where('nutritionLogId').equals(log.id).toArray()
      const existingKeys = new Set(existingItems.map((i) => `${i.foodItemId}|${i.mealType}`))
      let order = existingItems.length
      for (const meal of planMeals) {
        const key = `${meal.foodItemId}|${meal.mealType}`
        if (existingKeys.has(key)) continue
        await db.nutritionLogItems.add({
          id: crypto.randomUUID(),
          nutritionLogId: log.id,
          mealType: meal.mealType,
          foodItemId: meal.foodItemId,
          grams: meal.grams,
          order: order++,
        })
      }
    })
  }

  async function setNotes(notes: string) {
    const log = await getOrCreateNutritionLog(athlete.id, selectedDate)
    await db.nutritionLogs.update(log.id, { notes })
  }

  async function completeLog() {
    if (!currentLog) return
    await db.nutritionLogs.update(currentLog.id, { completedAt: new Date().toISOString() })
    navigate(`/athlete/${athlete.id}`)
  }

  async function deleteLog() {
    if (!currentLog) return
    await db.nutritionLogItems.where('nutritionLogId').equals(currentLog.id).delete()
    await db.nutritionLogs.delete(currentLog.id)
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Ernährungstag {selectedDate}</h2>
          {currentLog && (
            <Button variant="danger" onClick={deleteLog}>
              Eintrag löschen
            </Button>
          )}
        </div>

        <Field label="Datum">
          <input
            type="date"
            value={selectedDate}
            max={isoDate(new Date())}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          />
        </Field>

        <Field label="Ernährungsplan-Phase (optional)">
          <Select value={currentLog?.nutritionPlanId ?? ''} onChange={(e) => setNutritionPlanId(e.target.value)}>
            <option value="">– kein Plan zugeordnet –</option>
            {nutritionPlans?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.phaseName}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex flex-col gap-3">
          {groups.length === 0 && <p className="text-sm text-muted">🍽️ Noch keine Lebensmittel für diesen Tag protokolliert.</p>}
          {groups.map((group) => (
            <div key={group.mealType}>
              <div className="flex items-center justify-between pb-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-accent">{group.mealType}</div>
                <div className="text-xs text-muted">
                  {group.sum.kcal.toFixed(0)} kcal · P {group.sum.protein.toFixed(1)} g · C {group.sum.carbs.toFixed(1)} g · F{' '}
                  {group.sum.fat.toFixed(1)} g
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {group.rows.map(({ item }) => (
                  <LoggedFoodRow key={item.id} item={item} pickerItems={foodPickerItems} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={addFoodRow} className="flex-1">
            + Lebensmittel hinzufügen
          </Button>
          {coachMode && currentLog && items && items.length > 0 && (
            <Button variant="secondary" onClick={saveLogAsPlan} className="flex-1">
              Als Ernährungsplan speichern
            </Button>
          )}
        </div>

        <SumTable sums={sums} target={target} />

        <Field label="Notizen">
          <textarea
            value={currentLog?.notes ?? ''}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          />
        </Field>

        {currentLog?.completedAt ? (
          <p className="text-center text-sm text-ok">
            ✓ Abgeschlossen am {new Date(currentLog.completedAt).toLocaleString('de-DE')}
          </p>
        ) : (
          <Button variant="primary" onClick={completeLog} disabled={!currentLog}>
            Ernährung abschließen
          </Button>
        )}
      </Card>

      <Card className="flex flex-col gap-1">
        <h2 className="pb-1 text-sm font-semibold uppercase tracking-wide text-muted">Verlauf</h2>
        {!logs?.length && <p className="text-sm text-muted">📅 Noch keine Ernährungstage aufgezeichnet.</p>}
        <div className="flex max-h-64 flex-col overflow-y-auto">
          {logs?.map((log) => (
            <button
              key={log.id}
              onClick={() => setSelectedDate(log.date)}
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm ${
                log.date === selectedDate ? 'bg-surface-2' : ''
              }`}
            >
              <span className="text-muted">{log.date}</span>
              <span className="text-fg">
                {log.completedAt ? '✓ ' : ''}
                {log.nutritionPlanId ? planMap.get(log.nutritionPlanId)?.phaseName : ''}
              </span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}

function LoggedFoodRow({
  item,
  pickerItems,
}: {
  item: NutritionLogItem
  pickerItems: { id: string; label: string; sublabel?: string }[]
}) {
  return (
    <div className={`flex flex-col gap-2 rounded-lg border border-border p-2 ${item.done ? 'opacity-60' : ''}`}>
      <SearchPicker
        items={pickerItems}
        value={item.foodItemId || undefined}
        onChange={(id) => db.nutritionLogItems.update(item.id, { foodItemId: id })}
        placeholder="Lebensmittel suchen..."
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => db.nutritionLogItems.update(item.id, { done: !item.done })}
          aria-label={item.done ? 'Als nicht gegessen markieren' : 'Als gegessen markieren'}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm ${
            item.done ? 'border-accent bg-accent text-black' : 'border-border text-muted'
          }`}
        >
          ✓
        </button>
        <Select
          value={item.mealType}
          onChange={(e) => db.nutritionLogItems.update(item.id, { mealType: e.target.value as MealType })}
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
          value={item.grams}
          onChange={(e) => db.nutritionLogItems.update(item.id, { grams: Number(e.target.value) })}
          placeholder="Gramm"
          className="w-20 min-w-0 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm text-fg outline-none focus:border-accent"
        />
        <Button variant="ghost" onClick={() => db.nutritionLogItems.delete(item.id)}>
          ✕
        </Button>
      </div>
    </div>
  )
}

function diffTone(diff: number, tolerance: number): 'ok' | 'danger' {
  return Math.abs(diff) <= tolerance ? 'ok' : 'danger'
}

function SumTable({ sums, target }: { sums: Sums; target: ReturnType<typeof calculate> }) {
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
