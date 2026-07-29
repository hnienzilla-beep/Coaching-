import { MEAL_TYPES, SUPPLEMENT_TIMINGS } from '../../models/types'
import type { MealType, SupplementTiming } from '../../models/types'

/**
 * Parser für die Markdown-Dateien, die der Sync selbst schreibt (siehe fitnessExport.ts,
 * nutritionExport.ts und foodExport.ts) sowie für Lebensmittel-Neu.md, das in Obsidian
 * entsteht. Sie sind bewusst nachsichtig: Zeilen, die nicht ins Muster passen
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

// ------------------------------------------------------------ Markdowntabellen

/**
 * Zerlegt eine Tabellenzeile in ihre Zellen. `\|` gehört zum Zellinhalt (so schreibt der
 * Export Namen mit Pipe-Zeichen) und trennt deshalb nicht - lookbehind-Regex wird bewusst
 * vermieden, das ältere iOS-Safari-Versionen nicht kennen.
 */
export function splitTableRow(line: string): string[] {
  const cells: string[] = []
  let current = ''
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '\\' && line[i + 1] === '|') {
      current += '|'
      i++
      continue
    }
    if (char === '|') {
      cells.push(current)
      current = ''
      continue
    }
    current += char
  }
  cells.push(current)

  // Die äußeren Pipes erzeugen je eine leere Randzelle - die gehört nicht zur Tabelle.
  if (cells.length > 0 && cells[0].trim() === '') cells.shift()
  if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop()
  return cells.map((cell) => cell.trim())
}

/** Trennzeile einer Markdowntabelle ("|---|---|" bzw. "| :--- | ---: |"). */
export function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{1,}:?$/.test(cell))
}

export function isTableRow(line: string): boolean {
  return line.trim().startsWith('|')
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

// ------------------------------------------------------- Lebensmittel-Neu.md

export interface ParsedNewFood {
  name: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  /** Freitext-Spalte "Herkunft", z.B. "Claude 2026-07-29, geschätzt". Wird nicht gespeichert. */
  origin?: string
}

export interface ParsedNewFoodRow {
  /** Die Zeile im Original - fehlerhafte Zeilen bleiben so unverändert in der Datei stehen. */
  line: string
  /** `null`, wenn die Zeile nicht ins Format passt (falsche Spaltenzahl, unlesbare Zahlen). */
  food: ParsedNewFood | null
}

const NEW_FOOD_HEADERS = ['name', 'kcal', 'protein', 'kh', 'fett']

function isNewFoodHeader(cells: string[]): boolean {
  return NEW_FOOD_HEADERS.every((expected, i) => cells[i]?.toLowerCase() === expected)
}

/** Ist die Zeile die Kopfzeile "| Name | kcal | Protein | KH | Fett | Herkunft |"? */
export function isNewFoodHeaderRow(line: string): boolean {
  return isTableRow(line) && !isTableSeparator(line) && isNewFoodHeader(splitTableRow(line))
}

function toNewFood(cells: string[]): ParsedNewFood | null {
  // Die Herkunft ist reine Notiz - fehlt die Spalte, ist die Zeile trotzdem auswertbar.
  if (cells.length < 5 || cells.length > 6) return null
  const name = cells[0]
  if (!name) return null
  const [kcal, protein, carbs, fat] = cells.slice(1, 5).map(parseNumber)
  if (kcal === undefined || protein === undefined || carbs === undefined || fat === undefined) return null
  if (kcal < 0 || protein < 0 || carbs < 0 || fat < 0) return null
  return { name, kcal, protein, carbs, fat, origin: cells[5] || undefined }
}

/**
 * Liest die Tabelle aus Lebensmittel-Neu.md:
 * "| Popcorn (Kino, süß) | 450 | 5.5 | 72.0 | 12.5 | Claude 2026-07-29, geschätzt |".
 *
 * Kopf- und Trennzeile werden übersprungen; jede weitere Tabellenzeile kommt als
 * `ParsedNewFoodRow` zurück - fehlerhafte mit `food: null`, damit der Import sie überspringen
 * und in der Datei stehen lassen kann, statt abzubrechen.
 */
export function parseLebensmittelNeu(content: string): ParsedNewFoodRow[] {
  const rows: ParsedNewFoodRow[] = []
  for (const line of stripFrontmatter(content)) {
    if (!isTableRow(line)) continue
    if (isTableSeparator(line)) continue
    const cells = splitTableRow(line)
    if (isNewFoodHeader(cells)) continue
    rows.push({ line, food: toNewFood(cells) })
  }
  return rows
}

const LEBENSMITTEL_NEU_HEADER = '| Name | kcal | Protein | KH | Fett | Herkunft |'
const LEBENSMITTEL_NEU_SEPARATOR = '|---|---|---|---|---|---|'

/**
 * Baut Lebensmittel-Neu.md nach dem Import neu auf: Frontmatter, Überschriften und alles
 * außerhalb der Tabelle bleiben unverändert stehen, in der Tabelle bleiben nur noch
 * `keptLines` - die Zeilen also, die nicht importiert werden konnten. `null`, wenn die Datei
 * keine Tabelle enthält oder sich dadurch nichts ändert.
 */
export function rebuildLebensmittelNeu(content: string, keptLines: string[]): string | null {
  const all = content.split(/\r?\n/)
  const first = all.findIndex(isTableRow)
  if (first === -1) return null

  let last = first
  for (let i = all.length - 1; i > first; i--) {
    if (isTableRow(all[i])) {
      last = i
      break
    }
  }

  // Kopf- und Trennzeile der Datei behalten, sonst die Standardform schreiben. Passt die
  // erste Tabellenzeile nicht zum erwarteten Kopf, ist sie eine (fehlerhafte) Datenzeile und
  // steht bereits in keptLines - dann kommt der Standardkopf davor.
  const header = isNewFoodHeaderRow(all[first]) ? all[first] : LEBENSMITTEL_NEU_HEADER
  const separator = isTableSeparator(all[first + 1] ?? '') ? all[first + 1] : LEBENSMITTEL_NEU_SEPARATOR

  const next = [...all.slice(0, first), header, separator, ...keptLines, ...all.slice(last + 1)].join('\n')
  return next === content ? null : next
}
