import { db } from '../../db/db'
import { caloriesFromMacros } from '../../lib/calculator'
import { MEAL_TYPES } from '../../models/types'
import { getSyncSettings } from './settings'
import { syncFile } from './githubApi'
import { importErnaehrungLog, importErnaehrungsplan } from './vaultImport'

function round(n: number): number {
  return Math.round(n)
}

export const ERNAEHRUNGSPLAN_PATH = '40-Ernaehrung/Ernaehrungsplan.md'
export const ERNAEHRUNG_LOG_DIR = '40-Ernaehrung/Log'

/** Baut den aktuellen Ernährungsplan (erste Phase) des gewählten Athleten. */
async function buildErnaehrungsplan(): Promise<string> {
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

  return lines.join('\n')
}

/** Gleicht den Ernährungsplan in beide Richtungen ab. */
export async function syncErnaehrungsplan(): Promise<void> {
  await syncFile({
    path: ERNAEHRUNGSPLAN_PATH,
    build: buildErnaehrungsplan,
    commitMessage: 'Sync: Ernaehrungsplan',
    importRemote: async (content) => {
      await importErnaehrungsplan(content)
    },
  })
}

/** Baut das Ernährungslog eines Tages - `null`, wenn an dem Tag nichts erfasst wurde. */
async function buildErnaehrungLog(date: string): Promise<string | null> {
  const settings = getSyncSettings()
  if (!settings) throw new Error('Obsidian-Sync ist noch nicht eingerichtet.')

  const log = await db.nutritionLogs.where('[athleteId+date]').equals([settings.athleteId, date]).first()
  if (!log) return null

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
    `datum: ${date}`,
    `kalorien: ${round(totalKcal)}`,
    `protein_g: ${round(totalProtein)}`,
    `kohlenhydrate_g: ${round(totalCarbs)}`,
    `fett_g: ${round(totalFat)}`,
    '---',
    '',
  ].join('\n')

  const body = bodyLines.length > 0 ? bodyLines.join('\n') : '_Keine Mahlzeiten erfasst._\n'
  return frontmatter + body
}

/** Gleicht das Ernährungslog eines Tages in beide Richtungen ab. */
export async function syncErnaehrungLog(date: string): Promise<void> {
  await syncFile({
    path: `${ERNAEHRUNG_LOG_DIR}/${date}.md`,
    build: () => buildErnaehrungLog(date),
    commitMessage: `Sync ${date}: Ernaehrung`,
    importRemote: async (content) => {
      await importErnaehrungLog(date, content)
    },
  })
}
