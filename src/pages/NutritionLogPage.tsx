import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { getOrCreateNutritionLog, syncNutritionTotalsToDailyEntry, todayIso } from '../db/queries'
import { calculate, caloriesFromMacros, mealTypeForTime, nextOrder } from '../lib/calculator'
import { sumMacros, type Sums } from '../lib/macros'
import type { Athlete, FoodItem, MealType, NutritionLogItem, NutritionPlan } from '../models/types'
import { MEAL_TYPES } from '../models/types'
import { Button, Field, ListRow, MacroChips, SectionHeader, Select } from '../components/ui'
import AddFoodSheet from '../components/AddFoodSheet'
import PortionEditSheet from '../components/PortionEditSheet'
import CollapsibleCard from '../components/CollapsibleCard'
import DailySummary from '../components/DailySummary'
import MacroSumTable from '../components/MacroSumTable'
import LogDayHeader, { type LogDayStatus } from '../components/LogDayHeader'
import LogHistoryList from '../components/LogHistoryList'
import type { DayMarker } from '../components/DayStrip'
import { useCoachMode } from '../lib/detailLevel'
import { scaleGrams } from '../lib/recipes'

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
  const planMap = new Map((nutritionPlans ?? []).map((p) => [p.id, p]))
  // Ein Rezept ist kein Tagesablauf - es gehört nicht in die Planauswahl, sondern in den
  // Einfüge-Block darunter.
  const dayPlans = (nutritionPlans ?? []).filter((p) => !p.isRecipe)
  const recipes = (nutritionPlans ?? []).filter((p) => p.isRecipe)

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

  // Tracking-Synchronisierung: jeder Eintrag im Log gilt als gegessen, andere Tracking-Felder
  // (Gewicht, Körpermaße) bleiben unangetastet.
  //
  // Tage in der Zukunft bleiben außen vor (Altdaten aus der Zeit, als sich Essen vorausplanen
  // ließ): Am Tracking hängen 7-Tage-Trend, Gewichtsverlauf und `Gewicht.md`.
  useEffect(() => {
    if (!currentLog || selectedDate > todayIso()) return
    void syncNutritionTotalsToDailyEntry(athlete.id, selectedDate, {
      calories: sums.kcal,
      protein: sums.protein,
      carbs: sums.carbs,
      fat: sums.fat,
    })
  }, [currentLog, athlete.id, selectedDate, sums.kcal, sums.protein, sums.carbs, sums.fat])

  const groups = MEAL_TYPES.map((mealType) => {
    const groupRows = rows.filter((r) => r.item.mealType === mealType)
    return { mealType, rows: groupRows, sum: sumMacros(groupRows) }
  }).filter((g) => g.rows.length > 0)

  const suggestedMealType = mealTypeForTime()

  // Einen Tag abschließen gibt es nicht mehr: Was eingetragen ist, gilt als erfasst.
  const markers = new Map<string, DayMarker>((logs ?? []).map((l) => [l.date, 'done']))
  const status: LogDayStatus = currentLog ? 'logged' : 'none'

  async function addFood(foodItemId: string, grams: number, mealType: MealType) {
    const log = await getOrCreateNutritionLog(athlete.id, selectedDate)
    const existing = await db.nutritionLogItems.where('nutritionLogId').equals(log.id).toArray()
    await db.nutritionLogItems.add({
      id: crypto.randomUUID(),
      nutritionLogId: log.id,
      mealType,
      foodItemId,
      grams,
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
    navigate(`/athlete/${athlete.id}/ernaehrung`, { state: { view: 'plan' } })
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

  /**
   * Zutaten eines Rezepts anteilig ins Log übernehmen - als **einzelne** Zeilen, nicht als ein
   * Sammeleintrag: So stimmen die Makros aufs Gramm, und hinterher lässt sich jede Zutat noch
   * ändern oder entfernen. Anders als beim Tagesplan wird nicht auf Dubletten geprüft;
   * dasselbe Rezept zweimal einzufügen heißt hier, es zweimal gegessen zu haben.
   */
  async function addRecipeToLog(recipe: NutritionPlan, factor: number, mealType: MealType) {
    if (!(factor > 0)) return
    const meals = await db.planMeals.where('planId').equals(recipe.id).sortBy('order')
    if (meals.length === 0) return

    const log = await getOrCreateNutritionLog(athlete.id, selectedDate)
    await db.transaction('rw', db.nutritionLogItems, async () => {
      const existing = await db.nutritionLogItems.where('nutritionLogId').equals(log.id).toArray()
      let order = nextOrder(existing)
      for (const meal of meals) {
        const grams = scaleGrams(meal.grams, factor)
        // Eine auf 0 g geschrumpfte Zutat (1 g Salz bei einem Zehntel Rezept) wäre eine Zeile
        // ohne Inhalt - die bleibt weg.
        if (grams <= 0) continue
        await db.nutritionLogItems.add({
          id: crypto.randomUUID(),
          nutritionLogId: log.id,
          mealType,
          foodItemId: meal.foodItemId,
          grams,
          order: order++,
        })
      }
    })
  }

  async function setNotes(notes: string) {
    const log = await getOrCreateNutritionLog(athlete.id, selectedDate)
    await db.nutritionLogs.update(log.id, { notes })
  }

  async function deleteLog() {
    if (!currentLog) return
    await db.nutritionLogItems.where('nutritionLogId').equals(currentLog.id).delete()
    await db.nutritionLogs.delete(currentLog.id)
  }

  function historySummary(logId: string, planId?: string): string {
    const dayItems = (allItems ?? []).filter((i) => i.nutritionLogId === logId)
    const dayRows = dayItems.map((item) => macrosForPortion(foodMap.get(item.foodItemId), item.grams))
    const totalKcal = sumMacros(dayRows).kcal
    const kcalPart = totalKcal > 0 ? `${Math.round(totalKcal)} kcal` : ''
    return [kcalPart, planId ? planMap.get(planId)?.phaseName : undefined].filter(Boolean).join(' · ')
  }

  const [addMeal, setAddMeal] = useState<MealType | null>(null)
  const [editRow, setEditRow] = useState<Row | null>(null)

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

      {/* Beim Tageswechsel neu eingeblendet - so sieht man, dass sich der Inhalt geändert hat. */}
      <div key={selectedDate} className="anim-page flex flex-col gap-4">
        {/* Ampelfarben nur für vergangene Tage - heute liegt tagsüber naturgemäß alles unter dem Ziel. */}
        <DailySummary sums={sums} target={target} evaluate={!!currentLog && selectedDate < todayIso()} />
        {coachMode && (
          <CollapsibleCard title="Details (Ist / Ziel / Differenz)" defaultExpanded={false}>
            <MacroSumTable sums={sums} target={target} />
          </CollapsibleCard>
        )}

        <Button variant="primary" onClick={() => setAddMeal(suggestedMealType)} className="py-3">
          + Essen hinzufügen
        </Button>

        {groups.length === 0 ? (
          <p className="px-1 text-center text-sm text-muted">
            Noch nichts für diesen Tag erfasst. Füge Essen hinzu oder übernimm unten einen Plan.
          </p>
        ) : (
          <div className="anim-list flex flex-col gap-4">
            {groups.map((group) => (
              <section key={group.mealType} className="flex flex-col gap-1.5">
                <SectionHeader
                  title={group.mealType}
                  meta={`${Math.round(group.sum.kcal)} kcal`}
                  action={
                    <button
                      type="button"
                      onClick={() => setAddMeal(group.mealType)}
                      aria-label={`Essen zu ${group.mealType} hinzufügen`}
                      className="rounded-full px-2.5 py-0.5 text-lg leading-none text-muted hover:text-fg"
                    >
                      +
                    </button>
                  }
                />
                {group.rows.map((row) => (
                  <ListRow
                    key={row.item.id}
                    title={foodMap.get(row.item.foodItemId)?.name ?? 'Unbekanntes Lebensmittel'}
                    subtitle={
                      <>
                        {formatGrams(row.item.grams)} g · <MacroChips protein={row.protein} carbs={row.carbs} fat={row.fat} />
                      </>
                    }
                    value={`${Math.round(row.kcal)} kcal`}
                    onClick={() => setEditRow(row)}
                    ariaLabel={`${foodMap.get(row.item.foodItemId)?.name ?? 'Eintrag'} bearbeiten`}
                  />
                ))}
              </section>
            ))}
          </div>
        )}

        <CollapsibleCard title="Plan, Notizen & mehr" defaultExpanded={!!currentLog?.notes}>
          <Field label="Ernährungsplan übernehmen">
            <Select value={currentLog?.nutritionPlanId ?? ''} onChange={(e) => setNutritionPlanId(e.target.value)}>
              <option value="">– kein Plan –</option>
              {dayPlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.phaseName}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Notizen zum Tag">
            <textarea
              value={currentLog?.notes ?? ''}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Auffälligkeiten, Heißhunger, Abweichungen …"
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent"
            />
          </Field>

          {coachMode && currentLog && items && items.length > 0 && (
            <Button variant="secondary" onClick={saveLogAsPlan}>
              Als Ernährungsplan speichern
            </Button>
          )}
        </CollapsibleCard>
      </div>

      <LogHistoryList
        entries={(logs ?? []).map((log) => ({
          date: log.date,
          summary: historySummary(log.id, log.nutritionPlanId),
        }))}
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        emptyText="📅 Noch keine Ernährungstage aufgezeichnet."
      />

      <AddFoodSheet
        open={addMeal !== null}
        onClose={() => setAddMeal(null)}
        title="Essen hinzufügen"
        foods={foods ?? []}
        recipes={recipes}
        mealType={addMeal ?? suggestedMealType}
        onAddFood={addFood}
        onAddRecipe={addRecipeToLog}
      />

      <PortionEditSheet
        entry={editRow?.item ?? null}
        food={editRow ? foodMap.get(editRow.item.foodItemId) : undefined}
        onSave={async (grams, mealType) => {
          if (editRow) await db.nutritionLogItems.update(editRow.item.id, { grams, mealType })
        }}
        onRemove={async () => {
          if (editRow) await db.nutritionLogItems.delete(editRow.item.id)
        }}
        onClose={() => setEditRow(null)}
      />
    </div>
  )
}

function formatGrams(grams: number): string {
  return grams.toLocaleString('de-DE', { maximumFractionDigits: 1 })
}
