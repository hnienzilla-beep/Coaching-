import type { MuscleGroup } from '../models/types'

/**
 * Feine Muskeln für die Heatmap. Die grobe `MuscleGroup` einer Übung bleibt für Listen und
 * Filter erhalten; für die Heatmap zählt der Hauptmuskel (`Exercise.primaryMuscle`, sonst
 * automatisch aus dem Namen erkannt).
 */
export const MUSCLES = [
  'Brust',
  'Vordere Schulter',
  'Seitliche Schulter',
  'Hintere Schulter',
  'Bizeps',
  'Trizeps',
  'Unterarme',
  'Bauch',
  'Seitlicher Bauch',
  'Nacken/Trapez',
  'Latissimus',
  'Unterer Rücken',
  'Po',
  'Quadrizeps',
  'Beinbeuger',
  'Adduktoren',
  'Waden',
] as const
export type Muscle = (typeof MUSCLES)[number]

/** Richtwert (Sätze pro Woche) - ab hier voll gefärbt, darüber glüht der Muskel. */
export const DEFAULT_MUSCLE_TARGET: Record<Muscle, number> = {
  Brust: 12,
  'Vordere Schulter': 8,
  'Seitliche Schulter': 12,
  'Hintere Schulter': 8,
  Bizeps: 10,
  Trizeps: 10,
  Unterarme: 6,
  Bauch: 10,
  'Seitlicher Bauch': 6,
  'Nacken/Trapez': 6,
  Latissimus: 12,
  'Unterer Rücken': 6,
  Po: 10,
  Quadrizeps: 12,
  Beinbeuger: 10,
  Adduktoren: 6,
  Waden: 8,
}

// Schlüsselwörter im Übungsnamen → Hauptmuskel. Reihenfolge zählt: Spezifisches zuerst
// ("Enges Bankdrücken" ist Trizeps, nicht Brust; "Reverse Butterfly" hintere Schulter).
const RULES: [RegExp, Muscle][] = [
  [/enges bankdr|trizeps|french press|skull|dips an der bank|kickback|pushdown/i, 'Trizeps'],
  [/reverse (butterfly|fly)|face ?pull|hintere schulter|rear delt|reverse flys?/i, 'Hintere Schulter'],
  [/seitheben|lateral|aufrechtes rudern|upright row/i, 'Seitliche Schulter'],
  [/frontheben|schulterdr|pike|overhead press|military|arnold|shoulder press/i, 'Vordere Schulter'],
  [/shrug|nacken|trapez/i, 'Nacken/Trapez'],
  [/reverse curl|unterarm|handgelenk|wrist/i, 'Unterarme'],
  [/curl|bizeps/i, 'Bizeps'],
  [/russian twist|seitstütz|side plank|oblique|holzhack|woodchop/i, 'Seitlicher Bauch'],
  [/crunch|plank|beinheben|sit-?up|bauch|ab wheel|leg raise/i, 'Bauch'],
  [/beinbeuger|leg curl|rumänisch|romanian|nordic/i, 'Beinbeuger'],
  [/rückenstreck|hyperext|good morning|kreuzheben|deadlift/i, 'Unterer Rücken'],
  [/klimmz|latzug|pull-?up|lat |pullover|rudern|row/i, 'Latissimus'],
  [/bank|fliegende|butterfly|liegestütz|push-?up|dips|brust|chest|fly/i, 'Brust'],
  [/wade|calf/i, 'Waden'],
  [/adduktor|adductor/i, 'Adduktoren'],
  [/hip thrust|glute|\bpo\b|gesäß|kickbacks? kabel|frog/i, 'Po'],
  [/kniebeuge|squat|beinpresse|leg press|ausfallschritt|lunge|beinstrecker|leg extension|split/i, 'Quadrizeps'],
]

const GROUP_FALLBACK: Partial<Record<MuscleGroup, Muscle>> = {
  Brust: 'Brust',
  Rücken: 'Latissimus',
  Beine: 'Quadrizeps',
  Schultern: 'Seitliche Schulter',
  Arme: 'Bizeps',
  Bauch: 'Bauch',
}

/**
 * Hauptmuskel einer Übung: eigene Einstellung, sonst aus dem Namen erkannt, sonst aus der
 * groben Gruppe. Ganzkörper/Sonstiges ohne Treffer zählen nicht.
 */
export function primaryMuscle(exercise: { name: string; muscleGroup: MuscleGroup; primaryMuscle?: Muscle }): Muscle | undefined {
  if (exercise.primaryMuscle) return exercise.primaryMuscle
  for (const [re, muscle] of RULES) if (re.test(exercise.name)) return muscle
  return GROUP_FALLBACK[exercise.muscleGroup]
}

export function targetFor(muscle: Muscle, overrides?: Partial<Record<Muscle, number>>): number {
  const own = overrides?.[muscle]
  return own && own > 0 ? own : DEFAULT_MUSCLE_TARGET[muscle]
}

/** 0 (kalt) bis 1 (Richtwert erreicht); `glow`, sobald der Richtwert überschritten ist. */
export function muscleHeat(sets: number, target: number): { level: number; glow: boolean } {
  return { level: Math.max(0, Math.min(1, sets / Math.max(1, target))), glow: sets > target }
}

/** `secondary`: Zusatz-Eintrag für einen zweiten Hauptmuskel (z.B. Po bei RDLs). */
export type MuscleSetRecord = { muscle: Muscle; date: string; reps?: number; weightKg?: number; exercise: string; secondary?: boolean }

// Übungen, die neben dem Hauptmuskel einen zweiten voll treffen.
const CO_RULES: [RegExp, Muscle][] = [[/rumänisch|romanian|\brdl|good morning|einbeiniges kreuzheben|single.?leg deadlift/i, 'Po']]

/** Zweite Hauptmuskeln einer Übung (für Heatmap und Richtwerte) - ohne den Hauptmuskel selbst. */
export function coMuscles(name: string, primary?: Muscle): Muscle[] {
  return CO_RULES.filter(([re, m]) => re.test(name) && m !== primary).map(([, m]) => m)
}

/** Ein Satz als Einträge: Hauptmuskel plus ggf. zweite Hauptmuskeln. */
export function setRecords(base: Omit<MuscleSetRecord, 'muscle' | 'secondary'>, primary: Muscle): MuscleSetRecord[] {
  return [{ ...base, muscle: primary }, ...coMuscles(base.exercise, primary).map((muscle) => ({ ...base, muscle, secondary: true }))]
}

/**
 * "Heute dran": Muskeln unter ihrem Wochen-Richtwert, die mindestens 48 h Pause hatten -
 * sortiert nach der größten Lücke. Höchstens drei.
 */
export function todaysFocus(
  records: MuscleSetRecord[],
  today: string,
  overrides?: Partial<Record<Muscle, number>>,
): Muscle[] {
  const sets = new Map<Muscle, number>()
  const last = new Map<Muscle, string>()
  for (const r of records) {
    sets.set(r.muscle, (sets.get(r.muscle) ?? 0) + 1)
    if ((last.get(r.muscle) ?? '') < r.date) last.set(r.muscle, r.date)
  }
  const dayMs = 86_400_000
  const daysSince = (d?: string) => (d ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / dayMs) : 99)
  // Kleine Muskeln (Unterarme, Adduktoren …) nur, wenn nichts Größeres fehlt.
  const minor: Muscle[] = ['Unterarme', 'Adduktoren', 'Seitlicher Bauch', 'Nacken/Trapez', 'Unterer Rücken']
  return MUSCLES.filter((m) => daysSince(last.get(m)) >= 2)
    .map((m) => ({ m, gap: 1 - (sets.get(m) ?? 0) / targetFor(m, overrides), minor: minor.includes(m) }))
    .filter((x) => x.gap > 0.25)
    .sort((a, b) => Number(a.minor) - Number(b.minor) || b.gap - a.gap)
    .slice(0, 3)
    .map((x) => x.m)
}
