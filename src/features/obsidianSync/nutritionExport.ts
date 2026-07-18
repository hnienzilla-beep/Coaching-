import { db } from '../../db/db'
import { isoDate } from '../../db/queries'
import { caloriesFromMacros } from '../../lib/calculator'
import { MEAL_TYPES } from '../../models/types'
import { getSyncSettings } from './settings'
import { upsertFile } from './githubApi'

function round(n: number): number {
  return Math.round(n)
}

/** Schreibt den aktuellen Ernährungsplan (erste Phase) des gewählten Athleten. */
export async function syncErnaehrungsplan(): Promise<void> {
  const settings = getSyncSettings()
  if (!settings) throw new Error('Obsidian-Sync ist noch nicht eingerichtet.')

  const plans = await db.nutritionPlans.where('athleteId').equals(settings.athleteId).sortBy('order')
  const currentPlan = plans[0]

  const lines = ['---', 'typ: ernaehrungsplan', '---', '']

  if (!currentPlan) {
    lines.push('_Noch kein Ernährungsplan angelegt._', '')
  } else {
    const allMeals = await db.planMeals.where('planId').equals(currentPlan.id).sortBy('order')
    const foods = await db.foodItems.bulkGet(allMeals.map((m) => m.foodItemId))
    const foodMap = new Map(allMeals.map((m, i) => [m.id, foods[i]]))

    lines.push(`## Aktueller Plan: ${currentPlan.phaseName}`, '')

    let totalKcal = 0
    let totalProtein = 0
    let totalCarbs = 0
    let totalFat = 0

    for (const mealType of MEAL_TYPES) {
      const mealsOfType = allMeals.filter((m) => m.mealType === mealType)
      if (mealsOfType.length === 0) continue
      lines.push(`### ${mealType}`)
      for (const m of mealsOfType) {
        const food = foodMap.get(m.id)
        const factor = m.grams / 100
        const protein = food ? food.protein * factor : 0
        const carbs = food ? food.carbs * factor : 0
        const fat = food ? food.fat * factor : 0
        const kcal = caloriesFromMacros(protein, carbs, fat)
        totalKcal += kcal
        totalProtein += protein
        totalCarbs += carbs
        totalFat += fat
        lines.push(`- ${food?.name ?? '?'} – ${m.grams}g (${round(kcal)} kcal)`)
      }
      lines.push('')
    }

    if (allMeals.length === 0) {
      lines.push('_Keine Mahlzeiten im Plan._', '')
    } else {
      lines.push(
        `**Gesamt:** ${round(totalKcal)} kcal · ${round(totalProtein)} g Protein · ${round(totalCarbs)} g Kohlenhydrate · ${round(totalFat)} g Fett`,
        '',
      )
    }
  }

  await upsertFile('40-Ernaehrung/Ernaehrungsplan.md', lines.join('\n'), 'Sync: Ernaehrungsplan')
}

/** Exportiert das heutige Ernährungslog (falls vorhanden) nach 40-Ernaehrung/Log/JJJJ-MM-TT.md. */
export async function syncErnaehrungHeute(): Promise<void> {
  const settings = getSyncSettings()
  if (!settings) throw new Error('Obsidian-Sync ist noch nicht eingerichtet.')

  const today = isoDate(new Date())
  const log = await db.nutritionLogs
    .where('[athleteId+date]')
    .equals([settings.athleteId, today])
    .first()
  if (!log) return // kein Ernährungslog heute - nichts zu exportieren

  const items = await db.nutritionLogItems.where('nutritionLogId').equals(log.id).sortBy('order')
  const foods = await db.foodItems.bulkGet(items.map((i) => i.foodItemId))
  const foodMap = new Map(items.map((i, idx) => [i.id, foods[idx]]))

  let totalKcal = 0
  let totalProtein = 0
  let totalCarbs = 0
  let totalFat = 0
  const bodyLines: string[] = []

  for (const mealType of MEAL_TYPES) {
    const itemsOfType = items.filter((i) => i.mealType === mealType)
    if (itemsOfType.length === 0) continue
    bodyLines.push(`### ${mealType}`)
    for (const item of itemsOfType) {
      const food = foodMap.get(item.id)
      const factor = item.grams / 100
      const protein = food ? food.protein * factor : 0
      const carbs = food ? food.carbs * factor : 0
      const fat = food ? food.fat * factor : 0
      const kcal = caloriesFromMacros(protein, carbs, fat)
      if (item.done) {
        totalKcal += kcal
        totalProtein += protein
        totalCarbs += carbs
        totalFat += fat
      }
      bodyLines.push(`- ${item.done ? '[x]' : '[ ]'} ${food?.name ?? '?'} – ${item.grams}g (${round(kcal)} kcal)`)
    }
    bodyLines.push('')
  }

  const frontmatter = [
    '---',
    'typ: ernaehrung',
    `datum: ${today}`,
    `kalorien: ${round(totalKcal)}`,
    `protein_g: ${round(totalProtein)}`,
    `kohlenhydrate_g: ${round(totalCarbs)}`,
    `fett_g: ${round(totalFat)}`,
    '---',
    '',
  ].join('\n')

  const body = bodyLines.length > 0 ? bodyLines.join('\n') : '_Keine Mahlzeiten erfasst._\n'

  await upsertFile(`40-Ernaehrung/Log/${today}.md`, frontmatter + body, `Sync ${today}: Ernaehrung`)
}

/** Führt beide Ernährungs-Exporte nacheinander aus. */
export async function syncErnaehrungAlles(): Promise<void> {
  await syncErnaehrungsplan()
  await syncErnaehrungHeute()
}
