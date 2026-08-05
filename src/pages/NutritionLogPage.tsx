import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { getOrCreateNutritionLog, syncNutritionTotalsToDailyEntry, todayIso } from '../db/queries'
import { calculate, caloriesFromMacros, mealTypeForTime, nextOrder } from '../lib/calculator'
import { macroLine, sumMacros, type Sums } from '../lib/macros'
import type { Athlete, FoodItem, MealType, NutritionLogItem } from '../models/types'
import { MEAL_TYPES } from '../models/types'
import { Button, Card, Field, Select } from '../components/ui'
import { type SearchPickerItem } from '../components/SearchPicker'
import CollapsibleCard from '../components/CollapsibleCard'
import FoodPortionFields from '../components/FoodPortionFields'
import GroupAddChips from '../components/GroupAddChips'
import MacroBars from '../components/MacroBars'
import MacroSumTable from '../components/MacroSumTable'
import LogDayHeader, { type LogDayStatus } from '../components/LogDayHeader'
import LogHistoryList from '../components/LogHistoryList'
import type { DayMarker } from '../components/DayStrip'
import { useCoachMode } from '../lib/detailLevel'

type Ctx = { athlete: Athlete }

type Row = Sums & { item: NutritionLogItem }

/** Nährwerte einer Portion aus den Werten je 100 g. */
function macrosForPortion(food: FoodItem | undefined, grams: number): Sums {
  const factor = grams / 100
  const protein = food ? food.protein * factor : 0
  const carbs = food ? food.carbs * factor : 0
  const fat = food ? food.fat * factor : 0
  return { kcal: caloriesFromMacros(protein, carbs, fat), protein, carbs, fat }
}

export default function NutritionLogPage() {
  const { athlete } = useOutletContext<Ctx>()
  const navigate = useNavigate()
  const coachMode = useCoachMode()
  const logs = useLiveQuery(() => db.nutritionLogs.where('athleteId').equals(athlete.id).reverse().sortBy('date'), [athlete.id])
  const nutritionPlans = useLiveQuery(() => db.nutritionPlans.where('athleteId').equals(athlete.id).sortBy('order'), [athlete.id])
  const foods = useLiveQuery(() => db.foodItems.toArray(), [])

  const [selectedDate, setSelectedDate] = useState(todayIso())
  const currentLog = logs?.find((l) => l.date === selectedDate)

  const items = useLiveQuery(
    () => (currentLog ? db.nutritionLogItems.where('nutritionLogId').equals(currentLog.id).sortBy('order') : []),
    [currentLog?.id],
  )

  // Alle Einträge aller Tage - nur für die Kalorien-Zusammenfassung im Verlauf.
  const logIds = (logs ?? []).map((l) => l.id)
  const allItems = useLiveQuery(
    () => (logIds.length ? db.nutritionLogItems.where('nutritionLogId').anyOf(logIds).toArray() : []),
    [logIds.join(',')],
  )

  const foodMap = new Map((foods ?? []).map((f) => [f.id, f]))
  const foodPickerItems: SearchPickerItem[] = (foods ?? []).map((f) => ({
    id: f.id,
    label: f.name,
    sublabel: `${Math.round(caloriesFromMacros(f.protein, f.carbs, f.fat))} kcal/100g`,
    favorite: f.favorite,
    unconfirmed: f.unconfirmed,
  }))
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

  const rows: Row[] = (items ?? []).map((item) => ({ item, ...macrosForPortion(foodMap.get(item.foodItemId), item.grams) }))

  const sums = sumMacros(rows)
  const doneSums = sumMacros(rows.filter((r) => r.item.done))

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
    return { mealType, rows: groupRows, sum: sumMacros(groupRows) }
  }).filter((g) => g.rows.length > 0)

  const usedMealTypes = new Set(groups.map((g) => g.mealType))
  const suggestedMealType = mealTypeForTime()

  const markers = new Map<string, DayMarker>((logs ?? []).map((l) => [l.date, l.completedAt ? 'done' : 'open']))
  const status: LogDayStatus = !currentLog ? 'none' : currentLog.completedAt ? 'done' : 'open'

  async function addFoodRow(mealType: MealType) {
    const log = await getOrCreateNutritionLog(athlete.id, selectedDate)
    const existing = await db.nutritionLogItems.where('nutritionLogId').equals(log.id).toArray()
    await db.nutritionLogItems.add({
      id: crypto.randomUUID(),
      nutritionLogId: log.id,
      mealType,
      foodItemId: '',
      grams: 100,
      order: nextOrder(existing),
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
      let order = nextOrder(existingItems)
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
  }

  async function reopenLog() {
    if (!currentLog) return
    await db.nutritionLogs.update(currentLog.id, { completedAt: undefined })
  }

  async function deleteLog() {
    if (!currentLog) return
    await db.nutritionLogItems.where('nutritionLogId').equals(currentLog.id).delete()
    await db.nutritionLogs.delete(currentLog.id)
  }

  function historySummary(logId: string, planId?: string): string {
    const dayItems = (allItems ?? []).filter((i) => i.nutritionLogId === logId)
    const dayRows = dayItems.map((item) => macrosForPortion(foodMap.get(item.foodItemId), item.grams))
    const doneKcal = sumMacros(dayItems.filter((i) => i.done).map((item) => macrosForPortion(foodMap.get(item.foodItemId), item.grams))).kcal
    const totalKcal = sumMacros(dayRows).kcal
    const kcalPart = doneKcal > 0 ? `${Math.round(doneKcal)} kcal` : totalKcal > 0 ? `geplant ${Math.round(totalKcal)} kcal` : ''
    return [kcalPart, planId ? planMap.get(planId)?.phaseName : undefined].filter(Boolean).join(' · ')
  }

  return (
    <div className="flex flex-col gap-4">
      <LogDayHeader
        title="Ernährungstag"
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        markers={markers}
        status={status}
        onDelete={currentLog ? deleteLog : undefined}
        deleteConfirmText="Ernährungstag mit allen Einträgen löschen?"
      />

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Tagesbilanz</h2>
        <MacroBars done={doneSums} planned={sums} target={target} evaluate={!!currentLog?.completedAt} />
        {coachMode && (
          <CollapsibleCard title="Details (Ist / Ziel / Differenz)" variant="plain" defaultExpanded={false}>
            <MacroSumTable sums={sums} target={target} />
          </CollapsibleCard>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
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

        {groups.length === 0 && (
          <p className="text-sm text-muted">
            🍽️ Noch nichts für diesen Tag protokolliert. Wähle unten eine Mahlzeit – oder übernimm oben eine Plan-Phase.
          </p>
        )}

        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.mealType} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-fg">{group.mealType}</div>
                <Button variant="ghost" onClick={() => addFoodRow(group.mealType)} aria-label={`Lebensmittel zu ${group.mealType} hinzufügen`}>
                  + Lebensmittel
                </Button>
              </div>
              <div className="text-[11px] text-muted">{macroLine(group.sum)}</div>
              <div className="flex flex-col gap-1.5">
                {group.rows.map((row) => (
                  <LoggedFoodRow
                    key={row.item.id}
                    row={row}
                    foodName={foodMap.get(row.item.foodItemId)?.name}
                    pickerItems={foodPickerItems}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Die Mahlzeit wird vor dem Anlegen gewählt - vorher landete jede neue Zeile in der
            per Uhrzeit geratenen Mahlzeit und musste per Auswahlfeld korrigiert werden. */}
        <GroupAddChips
          label="Mahlzeit hinzufügen"
          options={MEAL_TYPES}
          used={usedMealTypes}
          onAdd={addFoodRow}
          highlight={suggestedMealType}
        />

        <Field label="Notizen zum Tag">
          <textarea
            value={currentLog?.notes ?? ''}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Auffälligkeiten, Heißhunger, Abweichungen …"
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          />
        </Field>

        {currentLog?.completedAt ? (
          <div className="flex flex-col items-center gap-1">
            <p className="text-center text-sm text-ok">
              ✓ Abgeschlossen am {new Date(currentLog.completedAt).toLocaleString('de-DE')}
            </p>
            <Button variant="ghost" onClick={reopenLog}>
              Wieder öffnen
            </Button>
          </div>
        ) : (
          <Button variant="primary" onClick={completeLog} disabled={!currentLog}>
            Ernährung abschließen
          </Button>
        )}

        {coachMode && currentLog && items && items.length > 0 && (
          <Button variant="ghost" onClick={saveLogAsPlan}>
            Als Ernährungsplan speichern
          </Button>
        )}
      </Card>

      <LogHistoryList
        entries={(logs ?? []).map((log) => ({
          date: log.date,
          done: !!log.completedAt,
          summary: historySummary(log.id, log.nutritionPlanId),
        }))}
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        emptyText="📅 Noch keine Ernährungstage aufgezeichnet."
      />
    </div>
  )
}

function LoggedFoodRow({
  row,
  foodName,
  pickerItems,
}: {
  row: Row
  foodName?: string
  pickerItems: SearchPickerItem[]
}) {
  const { item } = row
  // Neue Zeilen haben noch kein Lebensmittel - sie öffnen direkt die Suche.
  const [editing, setEditing] = useState(item.foodItemId === '')

  function update(patch: Partial<NutritionLogItem>) {
    void db.nutritionLogItems.update(item.id, patch)
  }

  return (
    <div className={`flex flex-col gap-2 rounded-lg border border-border p-2 ${item.done ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => update({ done: !item.done })}
          aria-label={item.done ? `${foodName ?? 'Eintrag'} als nicht gegessen markieren` : `${foodName ?? 'Eintrag'} als gegessen markieren`}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm ${
            item.done ? 'border-accent bg-accent text-accent-fg' : 'border-border text-muted'
          }`}
        >
          ✓
        </button>
        <button type="button" onClick={() => setEditing((v) => !v)} aria-expanded={editing} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm text-fg">{foodName ?? 'Lebensmittel wählen …'}</span>
          {/* Erst hier steht, was die Portion tatsächlich beiträgt - bisher gab es die
              Nährwerte nur als Summe über die ganze Mahlzeit. */}
          <span className="block truncate text-[11px] text-muted">
            {item.grams} g · {macroLine(row)}
          </span>
        </button>
        <button
          type="button"
          onClick={() => db.nutritionLogItems.delete(item.id)}
          aria-label={`${foodName ?? 'Eintrag'} entfernen`}
          className="shrink-0 px-1 py-2 text-sm text-muted hover:text-danger"
        >
          🗑
        </button>
      </div>

      {editing && (
        <div className="flex flex-col gap-2 border-t border-border pt-2">
          <FoodPortionFields
            pickerItems={pickerItems}
            foodItemId={item.foodItemId}
            grams={item.grams}
            onChange={update}
          />

          <Field label="Mahlzeit">
            <Select value={item.mealType} onChange={(e) => update({ mealType: e.target.value as MealType })}>
              {MEAL_TYPES.map((mt) => (
                <option key={mt} value={mt}>
                  {mt}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
    </div>
  )
}
