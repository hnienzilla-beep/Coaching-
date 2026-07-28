import { MEAL_TYPES, SUPPLEMENT_TIMINGS } from '../../models/types'
import type { MealType, SupplementTiming } from '../../models/types'

/**
 * Parser für die Markdown-Dateien, die der Sync selbst schreibt (siehe fitnessExport.ts und
 * nutritionExport.ts). Sie sind bewusst nachsichtig: Zeilen, die nicht ins Muster passen
 * (eigene Notizen, Überschriften, Absätze aus Obsidian), werden übersprungen statt zu einem
 * Fehler zu führen - so zerschießt eine handschriftliche Ergänzung im Vault nicht den Import.
 */

/** "84,5" und "84.5" akzeptieren, alles andere verwerfen. */
export function parseNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const value = Number(raw.trim().replace(',', '.'))
  return Number.isFinite(value) ? value : undefined
}

function lines(content: string): string[] {
  return content.split(/\r?\n/)
}

/** Entfernt den YAML-Frontmatter-Block am Dateianfang. */
function stripFrontmatter(content: string): string[] {
  const all = lines(content)
  if (all[0]?.trim() !== '---') return all
  const end = all.findIndex((line, i) => i > 0 && line.trim() === '---')
  return end === -1 ? all : all.slice(end + 1)
}

// ---------------------------------------------------------------- Gewicht.md

export interface ParsedWeight {
  date: string
  weightKg: number
}

/** Liest die Tabellenzeilen "| 2026-07-28 | 84.5 |" aus Gewicht.md. */
export function parseGewicht(content: string): ParsedWeight[] {
  const result: ParsedWeight[] = []
  const seen = new Set<string>()
  for (const line of stripFrontmatter(content)) {
    const match = line.match(/^\|\s*(\d{4}-\d{2}-\d{2})\s*\|([^|]*)\|/)
    if (!match) continue
    const weightKg = parseNumber(match[2])
    if (weightKg === undefined || weightKg <= 0) continue
    if (seen.has(match[1])) continue // erste (= neueste) Zeile pro Datum gewinnt
    seen.add(match[1])
    result.push({ date: match[1], weightKg })
  }
  return result
}

// ------------------------------------------------------- Training/<datum>.md

export interface ParsedSet {
  setNumber: number
  reps?: number
  weightKg?: number
  rpe?: number
  done: boolean
}

export interface ParsedExercise {
  name: string
  sets: ParsedSet[]
}

/** Liest Übungen ("### Bankdrücken") und Sätze ("- [x] Satz 1 · 8 Wdh. · 100 kg · RPE 8"). */
export function parseTraining(content: string): ParsedExercise[] {
  const exercises: ParsedExercise[] = []
  let current: ParsedExercise | null = null

  for (const line of stripFrontmatter(content)) {
    const heading = line.match(/^###\s+(.+?)\s*$/)
    if (heading) {
      current = { name: heading[1], sets: [] }
      exercises.push(current)
      continue
    }

    const setLine = line.match(/^\s*-\s*\[([ xX])\]\s*(.+)$/)
    if (!setLine || !current) continue

    const done = setLine[1].toLowerCase() === 'x'
    const parts = setLine[2].split('·').map((p) => p.trim())
    const set: ParsedSet = { setNumber: current.sets.length + 1, done }
    for (const part of parts) {
      const setNumber = part.match(/^Satz\s+(\d+)$/i)
      if (setNumber) {
        set.setNumber = Number(setNumber[1])
        continue
      }
      const reps = part.match(/^([\d.,]+)\s*Wdh\.?$/i)
      if (reps) {
        set.reps = parseNumber(reps[1])
        continue
      }
      const weight = part.match(/^([\d.,]+)\s*kg$/i)
      if (weight) {
        set.weightKg = parseNumber(weight[1])
        continue
      }
      const rpe = part.match(/^RPE\s*([\d.,]+)$/i)
      if (rpe) set.rpe = parseNumber(rpe[1])
    }
    current.sets.push(set)
  }

  return exercises.filter((e) => e.name && e.sets.length > 0)
}

// ------------------------------------------------------------ Supplemente.md

export interface ParsedSupplement {
  name: string
  dose: string
  timing: SupplementTiming
  notes?: string
}

export interface ParsedSupplementPlan {
  phaseName?: string
  items: ParsedSupplement[]
}

/** Liest "- **Kreatin** – 5 g, Morgens (mit Wasser)". */
export function parseSupplemente(content: string): ParsedSupplementPlan {
  const items: ParsedSupplement[] = []
  let phaseName: string | undefined

  for (const line of stripFrontmatter(content)) {
    const heading = line.match(/^##\s*Aktueller Plan:\s*(.+?)\s*$/i)
    if (heading) {
      phaseName = heading[1]
      continue
    }

    const item = line.match(/^\s*-\s*\*\*(.+?)\*\*\s*[–-]\s*(.+?)\s*$/)
    if (!item) continue

    let rest = item[2]
    let notes: string | undefined
    const withNotes = rest.match(/^(.*?)\s*\(([^()]*)\)$/)
    if (withNotes) {
      rest = withNotes[1]
      notes = withNotes[2].trim() || undefined
    }

    // Die Dosis darf selbst Kommas enthalten ("2,5 g"), deshalb wird das Timing hinten
    // anhand der bekannten Werte abgeschnitten statt am letzten Komma zu trennen.
    let timing: SupplementTiming = 'Morgens'
    const match = SUPPLEMENT_TIMINGS.find((t) => rest.toLowerCase().endsWith(t.toLowerCase()))
    if (match) {
      timing = match
      rest = rest.slice(0, rest.length - match.length).replace(/[,\s]+$/, '')
    }

    items.push({ name: item[1].trim(), dose: rest.trim(), timing, notes })
  }

  return { phaseName, items }
}

// ----------------------------------------- Ernaehrungsplan.md / Log/<datum>.md

export interface ParsedMealItem {
  mealType: MealType
  name: string
  grams: number
  done: boolean
}

export interface ParsedMeals {
  phaseName?: string
  items: ParsedMealItem[]
}

function toMealType(raw: string): MealType | undefined {
  return MEAL_TYPES.find((m) => m.toLowerCase() === raw.trim().toLowerCase())
}

/**
 * Liest Mahlzeiten unter "### Frühstück":
 * "- Haferflocken – 80g (300 kcal)" (Plan) bzw. "- [x] Haferflocken – 80g (300 kcal)" (Log).
 * Die Kalorienangabe in Klammern wird ignoriert - sie wird aus den Makros neu berechnet.
 */
export function parseMeals(content: string): ParsedMeals {
  const items: ParsedMealItem[] = []
  let phaseName: string | undefined
  let mealType: MealType | undefined

  for (const line of stripFrontmatter(content)) {
    const planHeading = line.match(/^##\s*Aktueller Plan:\s*(.+?)\s*$/i)
    if (planHeading) {
      phaseName = planHeading[1]
      continue
    }

    const heading = line.match(/^###\s+(.+?)\s*$/)
    if (heading) {
      mealType = toMealType(heading[1])
      continue
    }

    const item = line.match(/^\s*-\s*(?:\[([ xX])\]\s*)?(.+?)\s*[–-]\s*([\d.,]+)\s*g\b/)
    if (!item || !mealType) continue
    const grams = parseNumber(item[3])
    if (grams === undefined || grams <= 0) continue

    items.push({
      mealType,
      name: item[2].trim(),
      grams,
      // Ohne Checkbox (Ernährungsplan) gilt der Eintrag als geplant, nicht als gegessen.
      done: item[1] !== undefined && item[1].toLowerCase() === 'x',
    })
  }

  return { phaseName, items }
}
