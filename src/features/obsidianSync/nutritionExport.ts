import { db } from '../../db/db'
import { calculate, caloriesFromMacros } from '../../lib/calculator'
import type { CalculatorResult } from '../../lib/calculator'
import { scaleMacros, subtractMacros, sumMacros } from '../../lib/macros'
import type { Sums } from '../../lib/macros'
import { MEAL_TYPES } from '../../models/types'
import type { FoodItem } from '../../models/types'
import { servingsLabel, servingsOf } from '../../lib/recipes'
import { requireSettings } from './importLog'
import { buildFrontmatter } from './markdownBuild'
import { syncFile } from './githubApi'
import type { VaultTree } from './githubApi'
import { importErnaehrungLog, importErnaehrungsplan } from './vaultImport'

function round(n: number): number {
  return Math.round(n)
}

export const ERNAEHRUNGSPLAN_PATH = '40-Ernaehrung/Ernaehrungsplan.md'
export const ERNAEHRUNG_LOG_DIR = '40-Ernaehrung/Log'

/** Makros einer Portion - dieselbe Rechnung wie in der App. */
function macrosForPortion(food: FoodItem | undefined, grams: number): Sums {
  const factor = grams / 100
  const protein = food ? food.protein * factor : 0
  const carbs = food ? food.carbs * factor : 0
  const fat = food ? food.fat * factor : 0
  return { kcal: caloriesFromMacros(protein, carbs, fat), protein, carbs, fat }
}

/**
 * Kalorien- und Makro-Vorgabe des gewählten Athleten, gerechnet aus seinen Stammdaten.
 * `null`, wenn es den Athleten nicht (mehr) gibt - dann bleibt die Vorgabe in der Datei weg.
 */
async function macroTarget(): Promise<CalculatorResult | null> {
  const settings = requireSettings()
  const athlete = await db.athletes.get(settings.athleteId)
  return athlete ? calculate(athlete) : null
}

function targetSums(target: CalculatorResult): Sums {
  return { kcal: target.targetCalories, protein: target.proteinG, carbs: target.carbsG, fat: target.fatG }
}

/**
 * Vorgabe als Frontmatter-Felder. Reine Ausgabe: Der Import liest sie nicht zurück, weil sie
 * sich aus den Stammdaten in `Athlet.md` ergibt.
 */
function targetFields(target: CalculatorResult | null): Record<string, number | undefined> {
  return {
    ziel_kalorien: target?.targetCalories,
    ziel_protein_g: target?.proteinG,
    ziel_kohlenhydrate_g: target?.carbsG,
    ziel_fett_g: target?.fatG,
  }
}

/**
 * "2500 kcal · 180 g Protein · 250 g Kohlenhydrate · 70 g Fett" - mit `signed` bekommen Werte
 * über null ein Pluszeichen, damit eine Differenz als solche lesbar ist.
 */
function macroSummary(sums: Sums, signed = false): string {
  const fmt = (n: number): string => {
    const value = round(n)
    return signed && value > 0 ? `+${value}` : `${value}`
  }
  return `${fmt(sums.kcal)} kcal · ${fmt(sums.protein)} g Protein · ${fmt(sums.carbs)} g Kohlenhydrate · ${fmt(sums.fat)} g Fett`
}

/**
 * Bilanzblock unter den Mahlzeiten: Vorgabe, Ist und die Differenz dazwischen. Bewusst fette
 * Textzeilen und keine Listenpunkte - Listenpunkte würde der Import als Mahlzeit lesen.
 */
function balanceLines(target: CalculatorResult | null, actual: Sums, actualLabel: string): string[] {
  const lines = target ? [`**Vorgabe:** ${macroSummary(targetSums(target))}`] : []
  lines.push(`**${actualLabel}:** ${macroSummary(actual)}`)
  if (target) lines.push(`**Differenz:** ${macroSummary(subtractMacros(actual, targetSums(target)), true)}`)
  lines.push('')
  return lines
}

/** Baut alle Ernährungsplan-Phasen des gewählten Athleten. */
async function buildErnaehrungsplan(): Promise<string> {
  const settings = requireSettings()
  const target = await macroTarget()
  const plans = await db.nutritionPlans.where('athleteId').equals(settings.athleteId).sortBy('order')

  const lines = [...buildFrontmatter({ typ: 'ernaehrungsplan', ...targetFields(target) })]

  if (plans.length === 0) {
    lines.push('_Noch kein Ernährungsplan angelegt._', '')
    return lines.join('\n')
  }

  for (const plan of plans) {
    const allMeals = await db.planMeals.where('planId').equals(plan.id).sortBy('order')
    const foods = await db.foodItems.bulkGet(allMeals.map((m) => m.foodItemId))
    const foodMap = new Map(allMeals.map((m, i) => [m.id, foods[i]]))

    // Rezepte bekommen eine eigene Überschrift: Sie sind kein Tagesablauf, und der Import muss
    // sie beim Zurücklesen wieder als Rezept anlegen statt als Plan-Phase.
    lines.push(`## ${plan.isRecipe ? 'Rezept' : 'Plan'}: ${plan.phaseName}`, '')
    if (plan.isRecipe) lines.push(`**Ergibt:** ${servingsLabel(servingsOf(plan))}`, '')

    const portions: Sums[] = []

    for (const mealType of MEAL_TYPES) {
      const mealsOfType = allMeals.filter((m) => m.mealType === mealType)
      if (mealsOfType.length === 0) continue
      lines.push(`### ${mealType}`)
      for (const m of mealsOfType) {
        const food = foodMap.get(m.id)
        const sums = macrosForPortion(food, m.grams)
        portions.push(sums)
        lines.push(`- ${food?.name ?? '?'} – ${m.grams}g (${round(sums.kcal)} kcal)`)
      }
      lines.push('')
    }

    if (allMeals.length === 0) {
      lines.push(plan.isRecipe ? '_Keine Zutaten im Rezept._' : '_Keine Mahlzeiten im Plan._', '')
    } else if (plan.isRecipe) {
      // Ein Gericht am Tagesziel zu messen sagt nichts - hier zählt der Ansatz und was davon
      // auf eine Portion entfällt, also die Menge, die im Log landet.
      const total = sumMacros(portions)
      lines.push(
        `**Gesamt:** ${macroSummary(total)}`,
        `**Je Portion:** ${macroSummary(scaleMacros(total, 1 / servingsOf(plan)))}`,
        '',
      )
    } else {
      lines.push(...balanceLines(target, sumMacros(portions), 'Gesamt'))
    }
  }

  return lines.join('\n')
}

/** Gleicht den Ernährungsplan in beide Richtungen ab. */
export async function syncErnaehrungsplan(tree?: VaultTree | null): Promise<void> {
  await syncFile({
    path: ERNAEHRUNGSPLAN_PATH,
    build: buildErnaehrungsplan,
    commitMessage: 'Sync: Ernaehrungsplan',
    importRemote: async (content) => {
      await importErnaehrungsplan(content)
    },
    tree,
  })
}

/** Baut das Ernährungslog eines Tages - `null`, wenn an dem Tag nichts erfasst wurde. */
async function buildErnaehrungLog(date: string): Promise<string | null> {
  const settings = requireSettings()

  const log = await db.nutritionLogs.where('[athleteId+date]').equals([settings.athleteId, date]).first()
  if (!log) return null

  const target = await macroTarget()
  const plan = log.nutritionPlanId ? await db.nutritionPlans.get(log.nutritionPlanId) : undefined
  const items = await db.nutritionLogItems.where('nutritionLogId').equals(log.id).sortBy('order')
  const foods = await db.foodItems.bulkGet(items.map((i) => i.foodItemId))
  const foodMap = new Map(items.map((i, idx) => [i.id, foods[idx]]))

  // Wie in der App zählen nur die abgehakten ("gegessenen") Einträge in die Tagesbilanz.
  const eaten: Sums[] = []
  const bodyLines: string[] = []

  for (const mealType of MEAL_TYPES) {
    const itemsOfType = items.filter((i) => i.mealType === mealType)
    if (itemsOfType.length === 0) continue
    bodyLines.push(`### ${mealType}`)
    for (const item of itemsOfType) {
      const food = foodMap.get(item.id)
      const sums = macrosForPortion(food, item.grams)
      if (item.done) eaten.push(sums)
      bodyLines.push(`- ${item.done ? '[x]' : '[ ]'} ${food?.name ?? '?'} – ${item.grams}g (${round(sums.kcal)} kcal)`)
    }
    bodyLines.push('')
  }

  if (bodyLines.length === 0) bodyLines.push('_Keine Mahlzeiten erfasst._', '')

  const totals = sumMacros(eaten)
  bodyLines.push(...balanceLines(target, totals, 'Gegessen'))

  // Die Tagesnotiz gehört zum Log und wird zurückgelesen - anders als der "## Notizen"-Block,
  // der allein dem Nutzer gehört.
  if (log.notes) bodyLines.push('## Tagesnotiz', '', log.notes, '')

  return [
    ...buildFrontmatter({
      typ: 'ernaehrung',
      datum: date,
      plan: plan?.phaseName,
      abgeschlossen: log.completedAt,
      kalorien: round(totals.kcal),
      protein_g: round(totals.protein),
      kohlenhydrate_g: round(totals.carbs),
      fett_g: round(totals.fat),
      ...targetFields(target),
    }),
    ...bodyLines,
  ].join('\n')
}

/** Gleicht das Ernährungslog eines Tages in beide Richtungen ab. */
export async function syncErnaehrungLog(date: string, tree?: VaultTree | null): Promise<void> {
  await syncFile({
    path: `${ERNAEHRUNG_LOG_DIR}/${date}.md`,
    build: () => buildErnaehrungLog(date),
    commitMessage: `Sync ${date}: Ernaehrung`,
    importRemote: async (content) => {
      await importErnaehrungLog(date, content)
    },
    tree,
  })
}
