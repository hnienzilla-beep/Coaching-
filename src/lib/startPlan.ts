import { ACTIVITY_LEVELS, calculate, type CalculatorResult } from './calculator'
import type { Gender } from '../models/types'

/*
 * „Dein Start“: aus den Antworten des Einstiegs Ziele, Trainings- und Ernährungsplan ableiten.
 * Reine Rechnung ohne Datenbank - angelegt wird in lib/startApply.ts.
 */

export type StartGoal = 'abnehmen' | 'aufbauen' | 'recomp' | 'halten'
export type Tempo = 'sanft' | 'normal' | 'ehrgeizig'
export type MacroStyle = 'ausgewogen' | 'protein' | 'lowcarb'
export type Experience = 'einsteiger' | 'fortgeschritten' | 'erfahren'
export type Location = 'studio' | 'zuhause' | 'beides'
export type Split = 'ganzkoerper' | 'okuk' | 'ppl'
export type Diet = 'alles' | 'vegetarisch' | 'vegan' | 'pescetarisch'
export type Allergen = 'laktose' | 'gluten' | 'nuesse' | 'ei' | 'fisch' | 'soja'
export type Restriction = 'knie' | 'schulter' | 'ruecken' | 'handgelenk' | 'ellbogen'
export type Focus = 'Brust' | 'Rücken' | 'Beine' | 'Po' | 'Schultern' | 'Arme' | 'Bauch'

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
  macroStyle: MacroStyle
  experience: Experience
  /** Wochentage 0 = Montag … 6 = Sonntag. */
  trainingDays: number[]
  location: Location
  durationMin: 30 | 45 | 60 | 90
  focus: Focus[]
  restrictions: Restriction[]
  split?: Split
  cardio: boolean
  cardioMinutes: number
  diet: Diet
  allergens: Allergen[]
  supplements: string[]
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
  trainingDays: [0, 2, 4],
  location: 'studio',
  durationMin: 60,
  focus: [],
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
export function activityLevelFor(a: Pick<StartAnswers, 'activityMode' | 'alltag' | 'steps' | 'trainingDays'>): string {
  const base = a.activityMode === 'schritte' ? { wenig: 0, mittel: 1, viel: 2 }[a.steps] : { buero: 0, beine: 1, schwer: 2 }[a.alltag]
  const days = a.trainingDays.length
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
  if (style === 'protein') return { proteinPerKg: 2.4, fatPerKg: 0.9 }
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
  waterMl: number
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
    waterMl: Math.min(4500, Math.max(2000, Math.round((a.weightKg * 35) / 250) * 250)),
  }
}

/* ------------------------------------------------------------------------------------------
 * Trainingsplan
 * ---------------------------------------------------------------------------------------- */

type Slot =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'hamstring'
  | 'glute'
  | 'calves'
  | 'hpush'
  | 'incline'
  | 'vpush'
  | 'lateral'
  | 'rear'
  | 'vpull'
  | 'hpull'
  | 'biceps'
  | 'triceps'
  | 'core'

type Candidate = { name: string; home: boolean; avoid?: Restriction[] }

// Je Bewegungsmuster die Übungen in Vorzugsreihenfolge - Studio-Varianten zuerst.
const SLOT_EXERCISES: Record<Slot, Candidate[]> = {
  squat: [
    { name: 'Kniebeuge', home: false, avoid: ['knie', 'ruecken'] },
    { name: 'Beinpresse', home: false, avoid: ['knie'] },
    { name: 'Goblet Squat', home: true, avoid: ['knie'] },
    { name: 'Hip Thrust', home: true },
    { name: 'Glute Bridge', home: true },
  ],
  hinge: [
    { name: 'Rumänisches Kreuzheben', home: true, avoid: ['ruecken'] },
    { name: 'Hip Thrust', home: true },
    { name: 'Glute Bridge', home: true },
  ],
  lunge: [
    { name: 'Bulgarian Split Squat', home: true, avoid: ['knie'] },
    { name: 'Ausfallschritte', home: true, avoid: ['knie'] },
    { name: 'Beinstrecker', home: false, avoid: ['knie'] },
    { name: 'Glute Bridge', home: true },
  ],
  hamstring: [
    { name: 'Beinbeuger', home: false },
    { name: 'Rumänisches Kreuzheben', home: true, avoid: ['ruecken'] },
    { name: 'Glute Bridge', home: true },
  ],
  glute: [
    { name: 'Hip Thrust', home: true },
    { name: 'Glute Bridge', home: true },
  ],
  calves: [{ name: 'Wadenheben (stehend)', home: true }],
  hpush: [
    { name: 'Bankdrücken', home: false, avoid: ['schulter'] },
    { name: 'Kurzhantel-Bankdrücken', home: true },
    { name: 'Liegestütze', home: true, avoid: ['handgelenk'] },
    { name: 'Butterfly (Maschine)', home: false },
  ],
  incline: [
    { name: 'Schrägbankdrücken', home: false, avoid: ['schulter'] },
    { name: 'Kurzhantel-Fliegende', home: true },
    { name: 'Butterfly (Maschine)', home: false },
    { name: 'Liegestütze', home: true, avoid: ['handgelenk'] },
  ],
  vpush: [
    { name: 'Schulterdrücken (Kurzhantel)', home: true, avoid: ['schulter'] },
    { name: 'Pike Push-ups', home: true, avoid: ['schulter', 'handgelenk'] },
    { name: 'Seitheben', home: true },
  ],
  lateral: [{ name: 'Seitheben', home: true }],
  rear: [
    { name: 'Face Pulls', home: false },
    { name: 'Reverse Butterfly', home: true },
  ],
  vpull: [
    { name: 'Latzug', home: false },
    { name: 'Klimmzüge', home: false, avoid: ['schulter', 'ellbogen'] },
    { name: 'Kurzhantelrudern (einarmig)', home: true },
  ],
  hpull: [
    { name: 'Kabelrudern (sitzend)', home: false },
    { name: 'Langhantelrudern', home: false, avoid: ['ruecken'] },
    { name: 'Kurzhantelrudern (einarmig)', home: true },
  ],
  biceps: [
    { name: 'Bizepscurls (Langhantel)', home: false, avoid: ['handgelenk'] },
    { name: 'Bizepscurls (Kurzhantel)', home: true },
    { name: 'Hammercurls', home: true },
  ],
  triceps: [
    { name: 'Trizepsdrücken (Kabel)', home: false },
    { name: 'French Press', home: true, avoid: ['ellbogen', 'handgelenk'] },
    { name: 'Enges Bankdrücken', home: false, avoid: ['ellbogen', 'schulter'] },
  ],
  core: [
    { name: 'Plank', home: true },
    { name: 'Cable Crunch', home: false, avoid: ['ruecken'] },
    { name: 'Crunches', home: true },
    { name: 'Beinheben (hängend)', home: false },
  ],
}

const DAY_TEMPLATES: Record<string, Slot[]> = {
  'Ganzkörper A': ['squat', 'hpush', 'hpull', 'hinge', 'vpush', 'core', 'biceps', 'triceps'],
  'Ganzkörper B': ['hinge', 'vpull', 'incline', 'lunge', 'lateral', 'core', 'triceps', 'biceps'],
  'Ganzkörper C': ['lunge', 'hpush', 'vpull', 'glute', 'rear', 'core', 'calves', 'biceps'],
  'Oberkörper A': ['hpush', 'hpull', 'vpush', 'vpull', 'lateral', 'biceps', 'triceps', 'rear'],
  'Unterkörper A': ['squat', 'hinge', 'lunge', 'hamstring', 'calves', 'core', 'glute'],
  'Oberkörper B': ['incline', 'vpull', 'hpull', 'lateral', 'rear', 'triceps', 'biceps', 'vpush'],
  'Unterkörper B': ['hinge', 'glute', 'lunge', 'squat', 'calves', 'core', 'hamstring'],
  Push: ['hpush', 'vpush', 'incline', 'lateral', 'triceps', 'core', 'triceps'],
  Pull: ['vpull', 'hpull', 'rear', 'biceps', 'hinge', 'core', 'biceps'],
  Beine: ['squat', 'hinge', 'lunge', 'hamstring', 'glute', 'calves', 'core'],
}

const FOCUS_SLOTS: Record<Focus, Slot[]> = {
  Brust: ['hpush', 'incline'],
  Rücken: ['vpull', 'hpull'],
  Beine: ['squat', 'lunge', 'hamstring'],
  Po: ['glute', 'hinge'],
  Schultern: ['vpush', 'lateral', 'rear'],
  Arme: ['biceps', 'triceps'],
  Bauch: ['core'],
}

export const SPLIT_LABELS: Record<Split, string> = {
  ganzkoerper: 'Ganzkörper',
  okuk: 'Oberkörper / Unterkörper',
  ppl: 'Push / Pull / Beine',
}

/** Vorschlag je nach Trainingstagen und Erfahrung. */
export function suggestedSplit(days: number, experience: Experience): Split {
  if (days <= 3 || experience === 'einsteiger') return days >= 4 ? 'okuk' : 'ganzkoerper'
  return days >= 5 ? 'ppl' : 'okuk'
}

export interface PlanDay {
  name: string
  exercises: { name: string; sets: number; reps: string }[]
}

const EXERCISES_PER_DURATION: Record<StartAnswers['durationMin'], number> = { 30: 4, 45: 5, 60: 6, 90: 8 }

export function buildTrainingPlan(a: StartAnswers): PlanDay[] {
  const split = a.split ?? suggestedSplit(a.trainingDays.length, a.experience)
  const dayCount = Math.max(1, a.trainingDays.length)
  const names =
    split === 'ganzkoerper'
      ? ['Ganzkörper A', 'Ganzkörper B', 'Ganzkörper C'].slice(0, Math.min(3, Math.max(2, dayCount)))
      : split === 'okuk'
        ? dayCount >= 4
          ? ['Oberkörper A', 'Unterkörper A', 'Oberkörper B', 'Unterkörper B']
          : ['Oberkörper A', 'Unterkörper A']
        : ['Push', 'Pull', 'Beine']
  const count = EXERCISES_PER_DURATION[a.durationMin]
  const focusSlots = new Set(a.focus.flatMap((f) => FOCUS_SLOTS[f]))

  // Cardio verteilt auf die Trainingstage, mindestens 10 Minuten je Einheit.
  const cardioPerDay = a.cardio ? Math.max(10, Math.round(a.cardioMinutes / dayCount / 5) * 5) : 0
  const cardioName =
    a.location === 'zuhause'
      ? a.restrictions.includes('knie')
        ? 'Radfahren (Ergometer)'
        : 'Seilspringen'
      : a.restrictions.includes('knie')
        ? 'Radfahren (Ergometer)'
        : 'Crosstrainer'

  return names.map((name) => {
    let slots = DAY_TEMPLATES[name]
    // Schwerpunkte: ein Schwerpunkt-Muster, das hinter die Grenze fiele, rückt nach vorn.
    const inside = slots.slice(0, count)
    const extra = slots.slice(count).find((s) => focusSlots.has(s) && !inside.includes(s))
    if (extra) {
      const replaceAt = [...inside].reverse().findIndex((s) => !focusSlots.has(s))
      if (replaceAt !== -1) inside[inside.length - 1 - replaceAt] = extra
    }
    slots = inside

    const used = new Set<string>()
    const exercises: PlanDay['exercises'] = []
    slots.forEach((slot, i) => {
      const pick = SLOT_EXERCISES[slot].find(
        (c) => (a.location !== 'zuhause' || c.home) && !(c.avoid ?? []).some((r) => a.restrictions.includes(r)) && !used.has(c.name),
      )
      if (!pick) return
      used.add(pick.name)
      const base = a.experience === 'einsteiger' ? 3 : a.experience === 'erfahren' && i < 3 ? 4 : i < 2 && a.experience === 'fortgeschritten' ? 4 : 3
      const sets = Math.min(5, base + (focusSlots.has(slot) ? 1 : 0))
      exercises.push({ name: pick.name, sets, reps: pick.name === 'Plank' ? '30–60 s' : '8-12' })
    })
    if (cardioPerDay) exercises.push({ name: cardioName, sets: 1, reps: `${cardioPerDay} min` })
    return { name, exercises }
  })
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

const PROTEIN_MAIN = ['Hähnchenbrust (gegart)', 'Lachs (gegart)', 'Tofu (natur)', 'Linsen (rot, gekocht)', 'Ei (ganz)', 'Kichererbsen (gekocht)']
const PROTEIN_EVENING = ['Seelachs (gegart)', 'Putenkeule (gegart)', 'Rinderhack mager (roh)', 'Tempeh', 'Hüttenkäse (körnig)', 'Kichererbsen (gekocht)', 'Ei (ganz)', 'Tofu (natur)']
const BREAKFAST_PROTEIN = ['Skyr', 'Magerquark', 'Griechischer Joghurt 2%', 'Sojamilch (ungesüßt)', 'Ei (ganz)', 'Tofu (natur)', 'Kichererbsen (gekocht)']

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

/** Bei veganer Ernährung die pflanzlichen Varianten. */
export function supplementNamesFor(a: Pick<StartAnswers, 'supplements' | 'diet'>): string[] {
  return a.supplements.map((s) => (a.diet === 'vegan' && s === 'Omega-3 Fischöl' ? 'Omega-3 Algenöl (vegan)' : s))
}
