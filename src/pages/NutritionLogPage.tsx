import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { getOrCreateNutritionLog, syncNutritionTotalsToDailyEntry, todayIso } from '../db/queries'
import { calculate, caloriesFromMacros, mealTypeForTime, nextOrder } from '../lib/calculator'
import { GRAM_PRESETS, macroLine, sumMacros, type Sums } from '../lib/macros'
import type { Athlete, FoodItem, MealType, NutritionLogItem, NutritionPlan } from '../models/types'
import { MEAL_TYPES } from '../models/types'
import { Button, Card, Field, ListRow, MacroChips, SectionHeader, Select } from '../components/ui'
import AddFoodSheet, { AmountInput } from '../components/AddFoodSheet'
import CollapsibleCard from '../components/CollapsibleCard'
import MacroBars from '../components/MacroBars'
import MacroSumTable from '../components/MacroSumTable'
import Sheet from '../components/Sheet'
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

  const markers = new Map<string, DayMarker>((logs ?? []).map((l) => [l.date, l.completedAt ? 'done' : 'open']))
  const status: LogDayStatus = !currentLog ? 'none' : currentLog.completedAt ? 'done' : 'open'

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

      <Card className="flex flex-col gap-3">
        <MacroBars sums={sums} target={target} evaluate={!!currentLog?.completedAt} />
        {coachMode && (
          <CollapsibleCard title="Details (Ist / Ziel / Differenz)" variant="plain" defaultExpanded={false}>
            <MacroSumTable sums={sums} target={target} />
          </CollapsibleCard>
        )}
      </Card>

      <Button variant="primary" onClick={() => setAddMeal(suggestedMealType)} className="py-3">
        + Essen hinzufügen
      </Button>

      {groups.length === 0 ? (
        <p className="px-1 text-center text-sm text-muted">
          Noch nichts für diesen Tag erfasst. Füge Essen hinzu oder übernimm unten einen Plan.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
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

      {currentLog?.completedAt ? (
        <div className="flex flex-col items-center gap-1">
          <p className="text-center text-sm text-ok">✓ Abgeschlossen am {new Date(currentLog.completedAt).toLocaleString('de-DE')}</p>
          <Button variant="ghost" onClick={reopenLog}>
            Wieder öffnen
          </Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={completeLog} disabled={!currentLog}>
          Tag abschließen
        </Button>
      )}

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

      <EditLogItemSheet row={editRow} foodName={editRow ? foodMap.get(editRow.item.foodItemId)?.name : undefined} onClose={() => setEditRow(null)} />
    </div>
  )
}

function formatGrams(grams: number): string {
  return grams.toLocaleString('de-DE', { maximumFractionDigits: 1 })
}

/** Menge und Mahlzeit eines Eintrags ändern oder ihn entfernen. */
function EditLogItemSheet({ row, foodName, onClose }: { row: Row | null; foodName?: string; onClose: () => void }) {
  const [grams, setGrams] = useState<number | undefined>(row?.item.grams)
  const [mealType, setMealType] = useState<MealType | undefined>(row?.item.mealType)

  useEffect(() => {
    setGrams(row?.item.grams)
    setMealType(row?.item.mealType)
  }, [row])

  if (!row) return null
  const perGram = row.item.grams > 0 ? 1 / row.item.grams : 0
  const preview = {
    kcal: row.kcal * perGram * (grams ?? 0),
    protein: row.protein * perGram * (grams ?? 0),
    carbs: row.carbs * perGram * (grams ?? 0),
    fat: row.fat * perGram * (grams ?? 0),
  }

  async function save() {
    if (!row || !grams || grams <= 0) return
    await db.nutritionLogItems.update(row.item.id, { grams, mealType })
    onClose()
  }

  async function remove() {
    if (!row) return
    await db.nutritionLogItems.delete(row.item.id)
    onClose()
  }

  return (
    <Sheet
      open
      title={foodName ?? 'Eintrag bearbeiten'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button variant="danger" onClick={() => void remove()}>
            Entfernen
          </Button>
          <Button variant="primary" className="flex-1" disabled={!grams || grams <= 0} onClick={() => void save()}>
            Speichern
          </Button>
        </div>
      }
    >
      <AmountInput value={grams} onChange={setGrams} presets={GRAM_PRESETS} unit="g" label="Menge in Gramm" />
      <Field label="Mahlzeit">
        <Select value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>
          {MEAL_TYPES.map((mt) => (
            <option key={mt} value={mt}>
              {mt}
            </option>
          ))}
        </Select>
      </Field>
      {row.item.grams > 0 && <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm tabular-nums text-fg">{macroLine(preview)}</p>}
    </Sheet>
  )
}
