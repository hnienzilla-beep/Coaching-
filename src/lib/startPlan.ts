import { ACTIVITY_LEVELS, calculate, type CalculatorResult } from './calculator'
import type { Gender } from '../models/types'
import { SUPPLEMENT_SEED } from '../data/supplementSeed'
import { isCreatine, waterGoalFor } from './water'

/*
 * „Dein Start“: aus den Antworten des Einstiegs Ziele, Trainings- und Ernährungsplan ableiten.
 * Reine Rechnung ohne Datenbank - angelegt wird in lib/startApply.ts.
 */

export type StartGoal = 'abnehmen' | 'aufbauen' | 'recomp' | 'halten'
export type Tempo = 'sanft' | 'normal' | 'ehrgeizig'
export type MacroStyle = 'ausgewogen' | 'protein' | 'lowcarb'
import type { Experience, Lift, Location, Preference, Restriction, ScheduleMode, Split, TrainingGoal, VolumeMuscle, Zone } from './trainingPlan'
import { sessionsPerWeek } from './trainingPlan'
export type { Experience, Lift, Location, Preference, Restriction, ScheduleMode, Split, TrainingGoal, VolumeMuscle, Zone } from './trainingPlan'
export {
  CATALOG,
  LANDMARKS,
  LIFT_LABELS,
  LOCATION_LABELS,
  SPLIT_LABELS,
  VOLUME_MUSCLES,
  buildTrainingPlan,
  buildTrainingWeek,
  catalogByMuscle,
  effectiveSplit,
  planUnits,
  sessionsPerWeek,
  settingsFor,
  splitOptions,
  splitsFor,
  suggestedSplit,
  suggestedSplitFor,
  tier,
  type PlanDay,
  type PlanExercise,
  type TrainingWeek,
} from './trainingPlan'
export type Diet = 'alles' | 'vegetarisch' | 'vegan' | 'pescetarisch'
export type Allergen = 'laktose' | 'gluten' | 'nuesse' | 'ei' | 'fisch' | 'soja'

export interface StartAnswers {
  firstName: string
  gender: Gender
  birthDate: string
  heightCm: number
  weightKg: number
  bodyFatPct?: number
  activityMode: 'alltag' | 'schritte'
  alltag: 'buero' | 'beine' | 'schwer'
  steps: 'wenig' | 'mittel' | 'viel'
  goal: StartGoal
  tempo: Tempo
  targetWeightKg?: number
  /** Zielgewicht selbst eingetippt - dann kein Vorschlag mehr im Feld, auch wenn es leer ist. */
  targetWeightTyped?: boolean
  macroStyle: MacroStyle
  experience: Experience
  /** Feste Wochentage oder rotierender Rhythmus (z.B. 1 an / 1 aus). */
  scheduleMode: ScheduleMode
  /** Wochentage 0 = Montag … 6 = Sonntag (feste Tage). */
  trainingDays: number[]
  /** Einheit je Trainingstag (Index in planUnits) - feste Tage, sonst reihum. */
  dayUnits?: number[]
  rotation: { on: number; off: number; start: string }
  location: Location
  durationMin: 30 | 45 | 60 | 75 | 90
  /** Schwerpunkte je Einheit (bis zu 2), Schlüssel = Name der Einheit. */
  focusByUnit: Record<string, VolumeMuscle[]>
  restrictions: Restriction[]
  split?: Split
  trainingGoal?: TrainingGoal
  preference?: Preference
  favorites?: string[]
  excluded?: string[]
  maxSets?: number
  setSeconds?: number
  restCompound?: number
  restIsolation?: number
  mastered?: Lift[]
  variants?: 'gleich' | 'ab'
  volumeZones?: Partial<Record<VolumeMuscle, Zone>>
  /** Getauschte Übungen und eigene Satzzahlen aus der Zusammenfassung. */
  exerciseSwaps?: Record<string, string>
  setOverrides?: Record<string, number>
  cardio: boolean
  cardioMinutes: number
  diet: Diet
  allergens: Allergen[]
  supplements: string[]
  /** Selbst gewählt - sonst gelten die Empfehlungen (recommendSupplements). */
  supplementsTouched?: boolean
}

export const DEFAULT_ANSWERS: StartAnswers = {
  firstName: '',
  gender: 'Männlich',
  birthDate: '1995-01-01',
  heightCm: 178,
  weightKg: 80,
  activityMode: 'alltag',
  alltag: 'buero',
  steps: 'mittel',
  goal: 'abnehmen',
  tempo: 'normal',
  macroStyle: 'ausgewogen',
  experience: 'einsteiger',
  scheduleMode: 'fixed',
  trainingDays: [0, 2, 4],
  rotation: { on: 1, off: 1, start: new Date().toISOString().slice(0, 10) },
  location: 'studio',
  durationMin: 60,
  focusByUnit: {},
  restrictions: [],
  cardio: false,
  cardioMinutes: 60,
  diet: 'alles',
  allergens: [],
  supplements: [],
}

/* ------------------------------------------------------------------------------------------
 * Körper & Ziel
 * ---------------------------------------------------------------------------------------- */

export function ageFromBirthDate(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  if (!by || !ty) return 30
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0)
}

/** Aktivitätsstufe aus Alltag (bzw. Schritten) und Zahl der Trainingstage. */
export function activityLevelFor(a: Pick<StartAnswers, 'activityMode' | 'alltag' | 'steps' | 'trainingDays'> & Partial<Pick<StartAnswers, 'scheduleMode' | 'rotation'>>): string {
  const base = a.activityMode === 'schritte' ? { wenig: 0, mittel: 1, viel: 2 }[a.steps] : { buero: 0, beine: 1, schwer: 2 }[a.alltag]
  const days = a.scheduleMode === 'rotation' && a.rotation ? Math.round(sessionsPerWeek({ scheduleMode: 'rotation', trainingDays: a.trainingDays, rotation: a.rotation })) : a.trainingDays.length
  const training = days <= 1 ? 0 : days <= 3 ? 1 : days <= 5 ? 2 : 3
  const index = Math.min(ACTIVITY_LEVELS.length - 1, Math.max(0, Math.round((base + training) * 0.8)))
  return ACTIVITY_LEVELS[index].label
}

/** Ziel-Stufe des Rechners (GOALS in calculator.ts). */
export function goalLabelFor(goal: StartGoal, tempo: Tempo): string {
  if (goal === 'abnehmen') return { sanft: 'Leichte Diät', normal: 'Diät / Fettabbau', ehrgeizig: 'Aggressive Diät' }[tempo]
  if (goal === 'aufbauen') return tempo === 'ehrgeizig' ? 'Aufbau' : 'Lean Bulk'
  if (goal === 'recomp') return 'Leichte Diät'
  return 'Erhaltung'
}

export function macroFactors(style: MacroStyle): { proteinPerKg: number; fatPerKg: number } {
  if (style === 'protein') return { proteinPerKg: 2.3, fatPerKg: 0.8 }
  if (style === 'lowcarb') return { proteinPerKg: 2.2, fatPerKg: 1.4 }
  return { proteinPerKg: 2.0, fatPerKg: 1.0 }
}

/** Tempo in kg pro Woche (positiv = zunehmen). */
export function weeklyRateKg(goal: StartGoal, tempo: Tempo, weightKg: number): number {
  const pct = goal === 'abnehmen' ? { sanft: -0.25, normal: -0.5, ehrgeizig: -0.8 }[tempo] : goal === 'aufbauen' ? { sanft: 0.1, normal: 0.25, ehrgeizig: 0.4 }[tempo] : 0
  return Math.round(((weightKg * pct) / 100) * 100) / 100
}

/** Vorschlag fürs Zielgewicht - aus dem KFA (wenn bekannt), sonst aus einem gesunden BMI. */
export function suggestTargetWeight(a: Pick<StartAnswers, 'goal' | 'gender' | 'weightKg' | 'heightCm' | 'bodyFatPct' | 'experience'>): number {
  const round = (n: number) => Math.round(n * 2) / 2
  if (a.goal === 'aufbauen') return round(a.weightKg + (a.experience === 'einsteiger' ? 5 : a.experience === 'fortgeschritten' ? 3 : 2))
  if (a.goal !== 'abnehmen') return round(a.weightKg)
  const male = a.gender === 'Männlich'
  let target: number
  if (a.bodyFatPct) {
    const lean = a.weightKg * (1 - a.bodyFatPct / 100)
    const goalFat = male ? 0.13 : 0.22
    target = Math.min(a.weightKg, lean / (1 - Math.min(goalFat, a.bodyFatPct / 100)))
  } else {
    const h = a.heightCm / 100
    target = (male ? 24 : 22.5) * h * h
  }
  // Nie mehr als 15 % auf einmal - der Rest ist ein späteres, neues Ziel.
  return round(Math.min(a.weightKg - 1, Math.max(target, a.weightKg * 0.85)))
}

/** Hinweis mit Vorschlag, wenn ein Zielgewicht unrealistisch oder ungesund wäre. */
export function targetWarning(a: Pick<StartAnswers, 'goal' | 'gender' | 'weightKg' | 'heightCm' | 'bodyFatPct' | 'experience'>, target: number): string | undefined {
  const h = a.heightCm / 100
  const bmi = target / (h * h)
  const suggestion = suggestTargetWeight(a)
  if (bmi < 18.5) return `Das wäre ein BMI von ${bmi.toFixed(1).replace('.', ',')} – zu niedrig. Vorschlag: ${fmtKg(suggestion)}.`
  if (a.goal === 'abnehmen' && target > a.weightKg) return `Zum Abnehmen sollte das Ziel unter ${fmtKg(a.weightKg)} liegen. Vorschlag: ${fmtKg(suggestion)}.`
  if (a.goal === 'aufbauen' && target < a.weightKg) return `Zum Aufbauen sollte das Ziel über ${fmtKg(a.weightKg)} liegen. Vorschlag: ${fmtKg(suggestion)}.`
  if (Math.abs(target - a.weightKg) > a.weightKg * 0.2) return `Mehr als 20 % Veränderung ist ein sehr langer Weg – lieber in Etappen. Vorschlag: ${fmtKg(suggestion)}.`
  return undefined
}

function fmtKg(kg: number): string {
  return `${kg.toLocaleString('de-DE', { maximumFractionDigits: 1 })} kg`
}

/** Zieldatum aus Tempo (bei Halten/Recomp: keins). */
export function targetDateFor(goal: StartGoal, tempo: Tempo, weightKg: number, target: number, today: string): string | undefined {
  const rate = weeklyRateKg(goal, tempo, weightKg)
  if (!rate || Math.sign(target - weightKg) !== Math.sign(rate)) return undefined
  const weeks = Math.ceil(Math.abs(target - weightKg) / Math.abs(rate))
  const d = new Date(`${today}T00:00:00`)
  d.setDate(d.getDate() + weeks * 7)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface StartTargets {
  age: number
  activityLevel: string
  goalLabel: string
  proteinPerKg: number
  fatPerKg: number
  result: CalculatorResult
  targetWeightKg?: number
  targetDate?: string
  weeklyRateKg: number
  waterMl: number // 1 l je 20 kg, +1 l bei Kreatin
}

export function computeTargets(a: StartAnswers, today: string): StartTargets {
  const age = ageFromBirthDate(a.birthDate, today)
  const activityLevel = activityLevelFor(a)
  const goalLabel = goalLabelFor(a.goal, a.tempo)
  const { proteinPerKg, fatPerKg } = macroFactors(a.macroStyle)
  const result = calculate({ gender: a.gender, age, heightCm: a.heightCm, weightKg: a.weightKg, activityLevel, goal: goalLabel, proteinPerKg, fatPerKg })
  const target = a.goal === 'abnehmen' || a.goal === 'aufbauen' ? (a.targetWeightKg ?? suggestTargetWeight(a)) : undefined
  return {
    age,
    activityLevel,
    goalLabel,
    proteinPerKg,
    fatPerKg,
    result,
    targetWeightKg: target,
    targetDate: target !== undefined ? targetDateFor(a.goal, a.tempo, a.weightKg, target, today) : undefined,
    weeklyRateKg: weeklyRateKg(a.goal, a.tempo, a.weightKg),
    waterMl: waterGoalFor({ weightKg: a.weightKg }, undefined, supplementNamesFor(a).some(isCreatine)),
  }
}

/* ------------------------------------------------------------------------------------------
 * Ernährungsplan (Beispieltage)
 * ---------------------------------------------------------------------------------------- */

type FoodDiet = 'fleisch' | 'fisch' | 'vegetarisch' | 'vegan'
type Role = 'protein' | 'carb' | 'fat' | 'veg' | 'fruit'
type FoodTag = { diet: FoodDiet; allergens?: Allergen[]; grams: number }

// Nur die Lebensmittel, die die Vorlagen verwenden - mit Ernährungsform, Allergenen und
// Ausgangsmenge (danach wird auf die Makroziele skaliert).
const FOODS: Record<string, FoodTag> = {
  Skyr: { diet: 'vegetarisch', allergens: ['laktose'], grams: 250 },
  Magerquark: { diet: 'vegetarisch', allergens: ['laktose'], grams: 250 },
  'Griechischer Joghurt 2%': { diet: 'vegetarisch', allergens: ['laktose'], grams: 200 },
  'Hüttenkäse (körnig)': { diet: 'vegetarisch', allergens: ['laktose'], grams: 200 },
  'Ei (ganz)': { diet: 'vegetarisch', allergens: ['ei'], grams: 120 },
  'Sojamilch (ungesüßt)': { diet: 'vegan', allergens: ['soja'], grams: 300 },
  'Tofu (natur)': { diet: 'vegan', allergens: ['soja'], grams: 200 },
  Tempeh: { diet: 'vegan', allergens: ['soja'], grams: 150 },
  Seitan: { diet: 'vegan', allergens: ['gluten'], grams: 60 }, // Werte in der DB sind sehr proteinreich (75 g/100 g)
  'Edamame (gekocht)': { diet: 'vegan', allergens: ['soja'], grams: 150 },
  'Linsen (rot, gekocht)': { diet: 'vegan', grams: 200 },
  'Kichererbsen (gekocht)': { diet: 'vegan', grams: 200 },
  Hummus: { diet: 'vegan', grams: 80 },
  'Hähnchenbrust (gegart)': { diet: 'fleisch', grams: 150 },
  'Rinderhack mager (roh)': { diet: 'fleisch', grams: 150 },
  'Putenkeule (gegart)': { diet: 'fleisch', grams: 150 },
  'Lachs (gegart)': { diet: 'fisch', allergens: ['fisch'], grams: 150 },
  'Seelachs (gegart)': { diet: 'fisch', allergens: ['fisch'], grams: 180 },
  'Whey Protein (Pulver)': { diet: 'vegetarisch', allergens: ['laktose'], grams: 30 },
  Haferflocken: { diet: 'vegan', allergens: ['gluten'], grams: 60 },
  Vollkornbrot: { diet: 'vegan', allergens: ['gluten'], grams: 80 },
  Reiswaffeln: { diet: 'vegan', grams: 30 },
  'Buchweizen (gekocht)': { diet: 'vegan', grams: 150 },
  'Reis (gekocht)': { diet: 'vegan', grams: 180 },
  'Kartoffeln (gekocht)': { diet: 'vegan', grams: 250 },
  'Vollkornnudeln (gekocht)': { diet: 'vegan', allergens: ['gluten'], grams: 180 },
  'Süßkartoffel (gebacken)': { diet: 'vegan', grams: 200 },
  Banane: { diet: 'vegan', grams: 120 },
  Apfel: { diet: 'vegan', grams: 150 },
  Heidelbeeren: { diet: 'vegan', grams: 100 },
  Brokkoli: { diet: 'vegan', grams: 150 },
  Paprika: { diet: 'vegan', grams: 150 },
  Zucchini: { diet: 'vegan', grams: 150 },
  Spinat: { diet: 'vegan', grams: 100 },
  Olivenöl: { diet: 'vegan', grams: 10 },
  Avocado: { diet: 'vegan', grams: 60 },
  Leinsamen: { diet: 'vegan', grams: 15 },
  Chiasamen: { diet: 'vegan', grams: 15 },
  Erdnussbutter: { diet: 'vegan', allergens: ['nuesse'], grams: 20 },
  Mandeln: { diet: 'vegan', allergens: ['nuesse'], grams: 25 },
  Kürbiskerne: { diet: 'vegan', grams: 25 },
}

type MealTemplate = { meal: string; roles: [Role, string[]][] }

// Magere Quellen zuerst - sonst bringt das Protein mehr Fett mit, als das Ziel zulässt.
const PROTEIN_MAIN = ['Hähnchenbrust (gegart)', 'Seelachs (gegart)', 'Seitan', 'Linsen (rot, gekocht)', 'Tofu (natur)', 'Ei (ganz)', 'Kichererbsen (gekocht)']
const PROTEIN_EVENING = ['Lachs (gegart)', 'Putenkeule (gegart)', 'Rinderhack mager (roh)', 'Hüttenkäse (körnig)', 'Seitan', 'Linsen (rot, gekocht)', 'Tofu (natur)', 'Kichererbsen (gekocht)', 'Ei (ganz)', 'Tempeh']
const BREAKFAST_PROTEIN = ['Skyr', 'Magerquark', 'Griechischer Joghurt 2%', 'Sojamilch (ungesüßt)', 'Ei (ganz)', 'Tofu (natur)', 'Kichererbsen (gekocht)', 'Linsen (rot, gekocht)']

const TEMPLATES: Record<'Trainingstag' | 'Ruhetag', MealTemplate[]> = {
  Trainingstag: [
    { meal: 'Frühstück', roles: [['protein', BREAKFAST_PROTEIN], ['carb', ['Haferflocken', 'Buchweizen (gekocht)', 'Reiswaffeln']], ['fruit', ['Heidelbeeren', 'Banane']], ['fat', ['Leinsamen', 'Chiasamen']]] },
    { meal: 'Mittagessen', roles: [['protein', PROTEIN_MAIN], ['carb', ['Reis (gekocht)', 'Kartoffeln (gekocht)', 'Vollkornnudeln (gekocht)']], ['veg', ['Brokkoli', 'Paprika']], ['fat', ['Olivenöl']]] },
    { meal: 'Pre-Workout', roles: [['carb', ['Reiswaffeln', 'Vollkornbrot']], ['fruit', ['Banane', 'Apfel']]] },
    { meal: 'Post-Workout', roles: [['protein', ['Whey Protein (Pulver)', 'Skyr', 'Sojamilch (ungesüßt)', 'Edamame (gekocht)']], ['carb', ['Reiswaffeln', 'Banane']]] },
    { meal: 'Abendessen', roles: [['protein', PROTEIN_EVENING], ['carb', ['Süßkartoffel (gebacken)', 'Kartoffeln (gekocht)', 'Reis (gekocht)']], ['veg', ['Zucchini', 'Spinat', 'Paprika']], ['fat', ['Olivenöl', 'Avocado']]] },
  ],
  Ruhetag: [
    { meal: 'Frühstück', roles: [['protein', BREAKFAST_PROTEIN], ['carb', ['Vollkornbrot', 'Haferflocken', 'Buchweizen (gekocht)']], ['fruit', ['Apfel', 'Heidelbeeren']], ['fat', ['Erdnussbutter', 'Avocado', 'Kürbiskerne']]] },
    { meal: 'Mittagessen', roles: [['protein', PROTEIN_MAIN], ['carb', ['Kartoffeln (gekocht)', 'Reis (gekocht)', 'Vollkornnudeln (gekocht)']], ['veg', ['Paprika', 'Brokkoli']], ['fat', ['Olivenöl']]] },
    { meal: 'Snack 2', roles: [['protein', ['Hüttenkäse (körnig)', 'Skyr', 'Edamame (gekocht)', 'Hummus']], ['fruit', ['Apfel', 'Banane']], ['fat', ['Mandeln', 'Kürbiskerne']]] },
    { meal: 'Abendessen', roles: [['protein', PROTEIN_EVENING], ['carb', ['Kartoffeln (gekocht)', 'Süßkartoffel (gebacken)', 'Buchweizen (gekocht)']], ['veg', ['Spinat', 'Zucchini', 'Brokkoli']], ['fat', ['Olivenöl', 'Avocado']]] },
  ],
}

function allowed(name: string, diet: Diet, allergens: Allergen[]): boolean {
  const f = FOODS[name]
  if (!f) return false
  if ((f.allergens ?? []).some((x) => allergens.includes(x))) return false
  if (diet === 'vegan') return f.diet === 'vegan'
  if (diet === 'vegetarisch') return f.diet === 'vegan' || f.diet === 'vegetarisch'
  if (diet === 'pescetarisch') return f.diet !== 'fleisch'
  return true
}

export type FoodMacros = { name: string; kcal: number; protein: number; carbs: number; fat: number }
export interface MealPlanDay {
  name: 'Trainingstag' | 'Ruhetag'
  items: { meal: string; food: string; grams: number }[]
  totals: { kcal: number; protein: number; carbs: number; fat: number }
}

/** Zwei Beispieltage, deren Mengen auf Protein, Kohlenhydrate und Fett skaliert sind. */
export function buildMealPlans(a: Pick<StartAnswers, 'diet' | 'allergens'>, targets: { proteinG: number; carbsG: number; fatG: number }, foods: FoodMacros[]): MealPlanDay[] {
  const byName = new Map(foods.map((f) => [f.name, f]))
  return (['Trainingstag', 'Ruhetag'] as const).map((name) => {
    const used = new Set<string>()
    const rows: { meal: string; food: string; role: Role; base: number }[] = []
    for (const t of TEMPLATES[name]) {
      for (const [role, candidates] of t.roles) {
        const ok = candidates.filter((c) => byName.has(c) && allowed(c, a.diet, a.allergens))
        const pick = ok.find((c) => !used.has(c)) ?? ok[0]
        if (!pick) continue
        used.add(pick)
        rows.push({ meal: t.meal, food: pick, role, base: FOODS[pick].grams })
      }
    }
    // Drei Stellschrauben - Protein-, Kohlenhydrat- und Fettquellen - schrittweise angleichen.
    const scale: Record<Role, number> = { protein: 1, carb: 1, fat: 1, veg: 1, fruit: 1 }
    const totals = () => {
      const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
      for (const r of rows) {
        const f = byName.get(r.food)!
        const k = (r.base * scale[r.role]) / 100
        t.kcal += f.kcal * k
        t.protein += f.protein * k
        t.carbs += f.carbs * k
        t.fat += f.fat * k
      }
      return t
    }
    for (let i = 0; i < 12; i++) {
      const t = totals()
      const clamp = (n: number) => Math.min(3, Math.max(0.3, n))
      scale.protein = clamp(scale.protein * Math.sqrt(targets.proteinG / Math.max(1, t.protein)))
      scale.carb = clamp(scale.carb * Math.sqrt(targets.carbsG / Math.max(1, t.carbs)))
      // Fett steckt auch in den Proteinquellen - die Fettquellen dürfen deshalb fast ganz weg.
      scale.fat = Math.min(3, Math.max(0.1, scale.fat * Math.sqrt(targets.fatG / Math.max(1, t.fat))))
    }
    const items = rows.map((r) => ({ meal: r.meal, food: r.food, grams: Math.max(5, Math.round((r.base * scale[r.role]) / 5) * 5) }))
    const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    for (const it of items) {
      const f = byName.get(it.food)!
      const k = it.grams / 100
      t.kcal += f.kcal * k
      t.protein += f.protein * k
      t.carbs += f.carbs * k
      t.fat += f.fat * k
    }
    return { name, items, totals: { kcal: Math.round(t.kcal), protein: Math.round(t.protein), carbs: Math.round(t.carbs), fat: Math.round(t.fat) } }
  })
}

/* ------------------------------------------------------------------------------------------
 * Supplements
 * ---------------------------------------------------------------------------------------- */

export const START_SUPPLEMENTS = ['Kreatin Monohydrat', 'Whey Protein', 'Omega-3 Fischöl', 'Vitamin D3', 'Magnesium', 'Multivitamin', 'Zink', 'Koffein']

/** Kurze Erklärung je Supplement - steht in „Dein Start“ neben der Auswahl. */
const SUPPLEMENT_ABOUT: Record<string, string> = {
  'Kreatin Monohydrat': 'Mehr Kraft und ein, zwei Wiederholungen mehr – das am besten untersuchte Supplement. Jeden Tag nehmen, auch an Pausentagen.',
  'Whey Protein': 'Schnelles, praktisches Protein als Shake – ersetzt keine Mahlzeit, macht das Proteinziel aber leichter.',
  'Omega-3 Fischöl': 'EPA/DHA für Herz, Gelenke und Entzündungswerte.',
  'Omega-3 Algenöl (vegan)': 'EPA/DHA aus Algen – dieselbe Wirkung wie Fischöl, ohne Fisch.',
  'Vitamin D3': 'Für Knochen, Immunsystem und Muskelfunktion. Im Winter bekommen die meisten zu wenig Sonne.',
  Magnesium: 'Kann Krämpfen vorbeugen und beim Einschlafen helfen.',
  Multivitamin: 'Absicherung, wenn die Ernährung einseitig ist – kein Ersatz für Obst und Gemüse.',
  Zink: 'Für Immunsystem und Hormone. Sinnvoll bei wenig Fleisch oder viel Schwitzen.',
  Koffein: 'Mehr Wachheit und Leistung im Training. Nicht zu spät am Tag – sonst leidet der Schlaf.',
  'Vitamin B-Komplex': 'Vor allem B12 – in rein pflanzlicher Ernährung praktisch nicht enthalten.',
  Eisen: 'Gegen Müdigkeit bei Eisenmangel. Nur nach Blutbild, zu viel Eisen schadet.',
}

export interface SupplementInfo {
  name: string
  about?: string
  reason?: string // persönlich, wenn empfohlen
  dose?: string
  timing?: string
  notes?: string
  extra?: string // z.B. Wasser-Zuschlag bei Kreatin
}

/** Alles, was „Dein Start“ zu einem Supplement anzeigt. */
export function supplementInfo(name: string, a: Parameters<typeof recommendSupplements>[0]): SupplementInfo {
  const seed = SUPPLEMENT_SEED.find((x) => x.name === name)
  return {
    name,
    about: SUPPLEMENT_ABOUT[name],
    reason: recommendSupplements(a).find((r) => r.name === name)?.reason,
    dose: seed?.defaultDose,
    timing: seed?.defaultTiming,
    notes: seed?.notes,
    extra: isCreatine(name) ? 'Kreatin bindet Wasser: dein Trinkziel steigt um 1 l am Tag.' : undefined,
  }
}

/** Empfehlungen aus den Antworten - mit kurzem Grund. Namen wie in der Supplement-Datenbank. */
export function recommendSupplements(
  a: Pick<StartAnswers, 'trainingDays' | 'diet' | 'allergens' | 'gender' | 'weightKg' | 'macroStyle'> & Partial<Pick<StartAnswers, 'scheduleMode' | 'rotation'>>,
): { name: string; reason: string }[] {
  const out: { name: string; reason: string }[] = []
  const perWeek = a.scheduleMode === 'rotation' && a.rotation ? sessionsPerWeek({ scheduleMode: 'rotation', trainingDays: a.trainingDays, rotation: a.rotation }) : a.trainingDays.length
  const plantBased = a.diet === 'vegan' || a.diet === 'vegetarisch'
  if (perWeek >= 2) out.push({ name: 'Kreatin Monohydrat', reason: 'Mehr Kraft und Leistung bei regelmäßigem Training' })
  if (a.diet !== 'vegan' && !a.allergens.includes('laktose')) {
    const protein = Math.round(a.weightKg * macroFactors(a.macroStyle).proteinPerKg)
    out.push({ name: 'Whey Protein', reason: `Macht ${protein} g Protein am Tag leichter erreichbar` })
  }
  out.push({ name: 'Vitamin D3', reason: 'In unseren Breiten oft zu wenig – vor allem Oktober bis März' })
  if (plantBased || a.allergens.includes('fisch')) out.push({ name: 'Omega-3 Algenöl (vegan)', reason: 'Omega-3 ohne Fisch' })
  else if (a.diet === 'alles') out.push({ name: 'Omega-3 Fischöl', reason: 'Wenn du seltener als 2× pro Woche fetten Fisch isst' })
  if (perWeek >= 4) out.push({ name: 'Magnesium', reason: 'Bei viel Training für Muskeln und Schlaf' })
  if (a.diet === 'vegan') out.push({ name: 'Vitamin B-Komplex', reason: 'Vitamin B12 fehlt in veganer Ernährung' })
  if (plantBased && a.gender === 'Weiblich') out.push({ name: 'Eisen', reason: 'Eisen aus Pflanzen wird schlechter aufgenommen – vorher Blutwerte prüfen' })
  return out
}

/**
 * Supplements für den Plan: solange nichts selbst angeklickt wurde, die Empfehlungen; danach
 * die eigene Auswahl. Bei veganer Ernährung die pflanzlichen Varianten.
 */
export function supplementNamesFor(a: StartAnswers): string[] {
  const chosen = a.supplementsTouched ? a.supplements : recommendSupplements(a).map((r) => r.name)
  return [...new Set(chosen.map((s) => (a.diet === 'vegan' && s === 'Omega-3 Fischöl' ? 'Omega-3 Algenöl (vegan)' : s)))]
}
