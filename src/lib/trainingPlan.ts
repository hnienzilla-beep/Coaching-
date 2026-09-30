import type { StartAnswers } from './startPlan'
import type { Muscle } from './muscles'

/*
 * Trainingsplan aus „Dein Start“: Übungskatalog, Wochenvolumen je Muskel nach den
 * Volumen-Landmarken (MV/MEV/MAV/MRV), Zeitrechnung je Einheit, Fokus je Trainingstag,
 * feste Wochentage oder rotierender Rhythmus. Reine Rechnung ohne Datenbank.
 */

export type Experience = 'einsteiger' | 'fortgeschritten' | 'erfahren'
export type Location = 'studio' | 'basic' | 'zuhause' | 'beides'
export type Split = 'ganzkoerper' | 'okuk' | 'pushpullfb' | 'torsolimbs' | 'ppl' | 'pplokuk' | 'fbppl' | 'okukarme' | 'torsolimbsfb' | 'fbokuk' | 'arnold' | 'bro'
export type Restriction = 'knie' | 'schulter' | 'ruecken' | 'handgelenk' | 'ellbogen'
export type TrainingGoal = 'kraft' | 'aufbau' | 'fitness'
export type Preference = 'frei' | 'gemischt' | 'maschinen'
export type Lift = 'kniebeuge' | 'kreuzheben' | 'bankdruecken' | 'klimmzuege' | 'schulterdruecken'
export type Zone = 'MV' | 'MEV' | 'MAV'
export type ScheduleMode = 'fixed' | 'rotation'

/* ------------------------------------------------------------------------------------------
 * Volumen-Landmarken (Sätze pro Woche)
 * ---------------------------------------------------------------------------------------- */

export const VOLUME_MUSCLES = [
  'Brust',
  'Rücken',
  'Trapez',
  'Seitl./hint. Schulter',
  'Vord. Schulter',
  'Bizeps',
  'Trizeps',
  'Quadrizeps',
  'Beinbeuger',
  'Po',
  'Bauch',
  'Waden',
  'Adduktoren',
] as const
export type VolumeMuscle = (typeof VOLUME_MUSCLES)[number]

export interface Landmarks {
  mv: number
  mev: number
  mavLo: number
  mavHi: number
  mrv: number
}

export const LANDMARKS: Record<VolumeMuscle, Landmarks> = {
  Brust: { mv: 8, mev: 10, mavLo: 12, mavHi: 20, mrv: 22 },
  Rücken: { mv: 8, mev: 10, mavLo: 14, mavHi: 22, mrv: 25 },
  Trapez: { mv: 0, mev: 0, mavLo: 10, mavHi: 16, mrv: 26 },
  'Seitl./hint. Schulter': { mv: 0, mev: 8, mavLo: 16, mavHi: 22, mrv: 26 },
  'Vord. Schulter': { mv: 0, mev: 0, mavLo: 6, mavHi: 8, mrv: 12 },
  Bizeps: { mv: 5, mev: 8, mavLo: 14, mavHi: 20, mrv: 26 },
  Trizeps: { mv: 4, mev: 6, mavLo: 10, mavHi: 14, mrv: 18 },
  Quadrizeps: { mv: 6, mev: 8, mavLo: 12, mavHi: 18, mrv: 20 },
  Beinbeuger: { mv: 4, mev: 6, mavLo: 10, mavHi: 16, mrv: 20 },
  Po: { mv: 0, mev: 0, mavLo: 4, mavHi: 12, mrv: 16 },
  Bauch: { mv: 0, mev: 0, mavLo: 10, mavHi: 20, mrv: 25 },
  Waden: { mv: 6, mev: 8, mavLo: 12, mavHi: 16, mrv: 20 },
  Adduktoren: { mv: 0, mev: 0, mavLo: 4, mavHi: 8, mrv: 10 },
}

/** Muskeln mit MEV 0 bekommen nur als Schwerpunkt eigene Übungen - sonst reicht das indirekte Volumen. */
const INDIRECT_ONLY: VolumeMuscle[] = ['Trapez', 'Vord. Schulter', 'Adduktoren']
const BIG_MUSCLES: VolumeMuscle[] = ['Quadrizeps', 'Beinbeuger', 'Rücken', 'Po']

/* ------------------------------------------------------------------------------------------
 * Übungskatalog
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
  | 'frontraise'
  | 'lateral'
  | 'rear'
  | 'vpull'
  | 'hpull'
  | 'shrug'
  | 'biceps'
  | 'triceps'
  | 'core'
  | 'adductor'

/** lh Langhantel, kh Kurzhanteln, kg Körpergewicht, stange Klimmzugstange/Dipbarren. */
type Equipment = 'lh' | 'kh' | 'kg' | 'band' | 'stange' | 'bank' | 'kabel' | 'maschine'
type Kind = 'compound' | 'isolation' | 'small'

export interface CatalogExercise {
  name: string
  slot: Slot
  p: VolumeMuscle
  s?: VolumeMuscle[]
  eq: Equipment[]
  kind: Kind
  tech?: Lift
  avoid?: Restriction[]
  timed?: boolean
}

const ex = (
  slot: Slot,
  name: string,
  p: VolumeMuscle,
  eq: Equipment[],
  kind: Kind,
  more: Partial<Pick<CatalogExercise, 's' | 'tech' | 'avoid' | 'timed'>> = {},
): CatalogExercise => ({ name, slot, p, eq, kind, ...more })

// Je Bewegungsmuster in Vorzugsreihenfolge („Gemischt“). Frei/Maschinen sortiert um.
export const CATALOG: CatalogExercise[] = [
  // Kniebeuge-Muster
  ex('squat', 'Kniebeuge', 'Quadrizeps', ['lh'], 'compound', { s: ['Po', 'Adduktoren'], tech: 'kniebeuge', avoid: ['knie', 'ruecken'] }),
  ex('squat', 'Hackenschmidt-Kniebeuge', 'Quadrizeps', ['maschine'], 'compound', { s: ['Po'], avoid: ['knie'] }),
  ex('squat', 'Beinpresse', 'Quadrizeps', ['maschine'], 'compound', { s: ['Po', 'Adduktoren'], avoid: ['knie'] }),
  ex('squat', 'Frontkniebeuge', 'Quadrizeps', ['lh'], 'compound', { s: ['Po'], tech: 'kniebeuge', avoid: ['knie', 'handgelenk'] }),
  ex('squat', 'Smith-Maschine Kniebeuge', 'Quadrizeps', ['maschine'], 'compound', { s: ['Po'], avoid: ['knie'] }),
  ex('squat', 'Goblet Squat', 'Quadrizeps', ['kh'], 'compound', { s: ['Po', 'Adduktoren'], avoid: ['knie'] }),
  ex('squat', 'Kniebeuge (Körpergewicht)', 'Quadrizeps', ['kg'], 'compound', { s: ['Po'], avoid: ['knie'] }),
  ex('squat', 'Hip Thrust', 'Po', ['lh', 'bank'], 'compound', { s: ['Beinbeuger'] }),
  ex('squat', 'Glute Bridge', 'Po', ['kg'], 'compound', { s: ['Beinbeuger'] }),
  // Hüftstreckung
  ex('hinge', 'Rumänisches Kreuzheben', 'Beinbeuger', ['lh'], 'compound', { s: ['Po', 'Rücken'], tech: 'kreuzheben', avoid: ['ruecken'] }),
  ex('hinge', 'Kreuzheben', 'Rücken', ['lh'], 'compound', { s: ['Po', 'Beinbeuger', 'Trapez'], tech: 'kreuzheben', avoid: ['ruecken'] }),
  ex('hinge', 'Rumänisches Kreuzheben (Kurzhantel)', 'Beinbeuger', ['kh'], 'compound', { s: ['Po'], avoid: ['ruecken'] }),
  ex('hinge', '45°-Hyperextension', 'Po', ['maschine'], 'compound', { s: ['Beinbeuger'] }),
  ex('hinge', 'Good Morning', 'Beinbeuger', ['lh'], 'compound', { s: ['Po'], tech: 'kreuzheben', avoid: ['ruecken'] }),
  ex('hinge', 'Einbeiniges Kreuzheben', 'Beinbeuger', ['kh'], 'compound', { s: ['Po'] }),
  ex('hinge', 'Hip Thrust', 'Po', ['lh', 'bank'], 'compound', { s: ['Beinbeuger'] }),
  ex('hinge', 'Glute Bridge', 'Po', ['kg'], 'compound', { s: ['Beinbeuger'] }),
  // Ausfallschritt / Quadrizeps
  ex('lunge', 'Bulgarian Split Squat', 'Quadrizeps', ['kh'], 'compound', { s: ['Po', 'Adduktoren'], avoid: ['knie'] }),
  ex('lunge', 'Beinstrecker', 'Quadrizeps', ['maschine'], 'isolation', { avoid: ['knie'] }),
  ex('lunge', 'Ausfallschritte', 'Quadrizeps', ['kh'], 'compound', { s: ['Po'], avoid: ['knie'] }),
  ex('lunge', 'Walking Lunges', 'Quadrizeps', ['kh'], 'compound', { s: ['Po'], avoid: ['knie'] }),
  ex('lunge', 'Step-ups', 'Quadrizeps', ['kh'], 'compound', { s: ['Po'], avoid: ['knie'] }),
  ex('lunge', 'Beinpresse (einbeinig)', 'Quadrizeps', ['maschine'], 'compound', { s: ['Po'], avoid: ['knie'] }),
  ex('lunge', 'Glute Bridge', 'Po', ['kg'], 'compound', { s: ['Beinbeuger'] }),
  // Beinbeuger
  ex('hamstring', 'Beinbeuger', 'Beinbeuger', ['maschine'], 'isolation'),
  ex('hamstring', 'Beinbeuger (sitzend)', 'Beinbeuger', ['maschine'], 'isolation'),
  ex('hamstring', 'Rumänisches Kreuzheben (Kurzhantel)', 'Beinbeuger', ['kh'], 'compound', { s: ['Po'], avoid: ['ruecken'] }),
  ex('hamstring', 'Nordic Curls', 'Beinbeuger', ['kg'], 'isolation', { avoid: ['knie'] }),
  ex('hamstring', 'Beinbeuger mit Band', 'Beinbeuger', ['band'], 'isolation'),
  ex('hamstring', 'Glute Bridge', 'Po', ['kg'], 'compound', { s: ['Beinbeuger'] }),
  // Po
  ex('glute', 'Hip Thrust', 'Po', ['lh', 'bank'], 'compound', { s: ['Beinbeuger'] }),
  ex('glute', 'Hip Thrust (Maschine)', 'Po', ['maschine'], 'compound', { s: ['Beinbeuger'] }),
  ex('glute', 'Kabel-Kickbacks', 'Po', ['kabel'], 'isolation'),
  ex('glute', 'Abduktoren-Maschine', 'Po', ['maschine'], 'isolation'),
  ex('glute', 'Glute Bridge', 'Po', ['kg'], 'compound', { s: ['Beinbeuger'] }),
  ex('glute', 'Seitliches Gehen mit Band', 'Po', ['band'], 'small'),
  // Waden
  ex('calves', 'Wadenheben (stehend)', 'Waden', ['kg'], 'small'),
  ex('calves', 'Wadenheben (sitzend)', 'Waden', ['maschine'], 'small'),
  ex('calves', 'Wadenheben an der Beinpresse', 'Waden', ['maschine'], 'small'),
  ex('calves', 'Einbeiniges Wadenheben', 'Waden', ['kh'], 'small'),
  // Drücken horizontal
  ex('hpush', 'Bankdrücken', 'Brust', ['lh', 'bank'], 'compound', { s: ['Trizeps', 'Vord. Schulter'], tech: 'bankdruecken', avoid: ['schulter'] }),
  ex('hpush', 'Kurzhantel-Bankdrücken', 'Brust', ['kh', 'bank'], 'compound', { s: ['Trizeps', 'Vord. Schulter'] }),
  ex('hpush', 'Brustpresse (Maschine)', 'Brust', ['maschine'], 'compound', { s: ['Trizeps', 'Vord. Schulter'] }),
  ex('hpush', 'Smith-Maschine Bankdrücken', 'Brust', ['maschine'], 'compound', { s: ['Trizeps', 'Vord. Schulter'], avoid: ['schulter'] }),
  ex('hpush', 'Dips', 'Brust', ['stange'], 'compound', { s: ['Trizeps', 'Vord. Schulter'], avoid: ['schulter', 'ellbogen'] }),
  ex('hpush', 'Liegestütze', 'Brust', ['kg'], 'compound', { s: ['Trizeps', 'Vord. Schulter'], avoid: ['handgelenk'] }),
  ex('hpush', 'Kurzhantel-Bodendrücken', 'Brust', ['kh'], 'compound', { s: ['Trizeps'] }),
  ex('hpush', 'Butterfly (Maschine)', 'Brust', ['maschine'], 'isolation'),
  // Drücken schräg / Brust oben
  ex('incline', 'Schrägbankdrücken', 'Brust', ['lh', 'bank'], 'compound', { s: ['Vord. Schulter', 'Trizeps'], tech: 'bankdruecken', avoid: ['schulter'] }),
  ex('incline', 'Kurzhantel-Schrägbankdrücken', 'Brust', ['kh', 'bank'], 'compound', { s: ['Vord. Schulter', 'Trizeps'] }),
  ex('incline', 'Schräge Brustpresse (Maschine)', 'Brust', ['maschine'], 'compound', { s: ['Vord. Schulter', 'Trizeps'] }),
  ex('incline', 'Kabel-Crossover', 'Brust', ['kabel'], 'isolation'),
  ex('incline', 'Kurzhantel-Fliegende', 'Brust', ['kh', 'bank'], 'isolation'),
  ex('incline', 'Butterfly (Maschine)', 'Brust', ['maschine'], 'isolation'),
  ex('incline', 'Liegestütze (Füße erhöht)', 'Brust', ['kg'], 'compound', { s: ['Vord. Schulter', 'Trizeps'], avoid: ['handgelenk'] }),
  ex('incline', 'Fliegende mit Band', 'Brust', ['band'], 'isolation'),
  // Drücken vertikal
  ex('vpush', 'Schulterdrücken (Kurzhantel)', 'Vord. Schulter', ['kh'], 'compound', { s: ['Trizeps', 'Seitl./hint. Schulter'], avoid: ['schulter'] }),
  ex('vpush', 'Schulterdrücken (Langhantel)', 'Vord. Schulter', ['lh'], 'compound', { s: ['Trizeps', 'Seitl./hint. Schulter'], tech: 'schulterdruecken', avoid: ['schulter', 'ruecken'] }),
  ex('vpush', 'Schulterpresse (Maschine)', 'Vord. Schulter', ['maschine'], 'compound', { s: ['Trizeps', 'Seitl./hint. Schulter'], avoid: ['schulter'] }),
  ex('vpush', 'Arnold Press', 'Vord. Schulter', ['kh'], 'compound', { s: ['Trizeps', 'Seitl./hint. Schulter'], avoid: ['schulter'] }),
  ex('vpush', 'Landmine Press', 'Vord. Schulter', ['lh'], 'compound', { s: ['Trizeps', 'Brust'] }),
  ex('vpush', 'Pike Push-ups', 'Vord. Schulter', ['kg'], 'compound', { s: ['Trizeps'], avoid: ['schulter', 'handgelenk'] }),
  ex('vpush', 'Seitheben', 'Seitl./hint. Schulter', ['kh'], 'small'),
  // Vordere Schulter isoliert (nur als Schwerpunkt)
  ex('frontraise', 'Frontheben (Kurzhantel)', 'Vord. Schulter', ['kh'], 'small'),
  ex('frontraise', 'Frontheben am Kabel', 'Vord. Schulter', ['kabel'], 'small'),
  ex('frontraise', 'Frontheben mit Band', 'Vord. Schulter', ['band'], 'small'),
  // Seitliche Schulter
  ex('lateral', 'Seitheben', 'Seitl./hint. Schulter', ['kh'], 'small'),
  ex('lateral', 'Seitheben am Kabel', 'Seitl./hint. Schulter', ['kabel'], 'small'),
  ex('lateral', 'Seitheben (Maschine)', 'Seitl./hint. Schulter', ['maschine'], 'small'),
  ex('lateral', 'Seitheben mit Band', 'Seitl./hint. Schulter', ['band'], 'small'),
  ex('lateral', 'Aufrechtes Rudern', 'Seitl./hint. Schulter', ['lh'], 'isolation', { s: ['Trapez'], avoid: ['schulter'] }),
  // Hintere Schulter
  ex('rear', 'Face Pulls', 'Seitl./hint. Schulter', ['kabel'], 'small', { s: ['Trapez'] }),
  ex('rear', 'Reverse Butterfly', 'Seitl./hint. Schulter', ['maschine'], 'small'),
  ex('rear', 'Vorgebeugtes Seitheben', 'Seitl./hint. Schulter', ['kh'], 'small'),
  ex('rear', 'Face Pulls mit Band', 'Seitl./hint. Schulter', ['band'], 'small'),
  // Ziehen vertikal
  ex('vpull', 'Latzug', 'Rücken', ['kabel'], 'compound', { s: ['Bizeps', 'Seitl./hint. Schulter'] }),
  ex('vpull', 'Klimmzüge', 'Rücken', ['stange'], 'compound', { s: ['Bizeps', 'Seitl./hint. Schulter'], tech: 'klimmzuege', avoid: ['schulter', 'ellbogen'] }),
  ex('vpull', 'Latzug (eng)', 'Rücken', ['kabel'], 'compound', { s: ['Bizeps'] }),
  ex('vpull', 'Klimmzüge (assistiert)', 'Rücken', ['maschine'], 'compound', { s: ['Bizeps'], avoid: ['ellbogen'] }),
  ex('vpull', 'Überzüge am Kabel', 'Rücken', ['kabel'], 'isolation'),
  ex('vpull', 'Kurzhantelrudern (einarmig)', 'Rücken', ['kh'], 'compound', { s: ['Bizeps', 'Seitl./hint. Schulter'] }),
  ex('vpull', 'Latziehen mit Band', 'Rücken', ['band'], 'compound', { s: ['Bizeps'] }),
  // Ziehen horizontal
  ex('hpull', 'Kabelrudern (sitzend)', 'Rücken', ['kabel'], 'compound', { s: ['Bizeps', 'Seitl./hint. Schulter', 'Trapez'] }),
  ex('hpull', 'Langhantelrudern', 'Rücken', ['lh'], 'compound', { s: ['Bizeps', 'Seitl./hint. Schulter', 'Trapez'], avoid: ['ruecken'] }),
  ex('hpull', 'Brustgestütztes Rudern (Maschine)', 'Rücken', ['maschine'], 'compound', { s: ['Bizeps', 'Seitl./hint. Schulter', 'Trapez'] }),
  ex('hpull', 'T-Bar-Rudern', 'Rücken', ['lh'], 'compound', { s: ['Bizeps', 'Trapez'], avoid: ['ruecken'] }),
  ex('hpull', 'Kurzhantelrudern (einarmig)', 'Rücken', ['kh'], 'compound', { s: ['Bizeps', 'Seitl./hint. Schulter'] }),
  ex('hpull', 'Umgekehrtes Rudern', 'Rücken', ['stange'], 'compound', { s: ['Bizeps', 'Seitl./hint. Schulter'] }),
  ex('hpull', 'Rudern mit Band', 'Rücken', ['band'], 'compound', { s: ['Bizeps'] }),
  // Nacken
  ex('shrug', 'Shrugs (Kurzhantel)', 'Trapez', ['kh'], 'small'),
  ex('shrug', 'Shrugs (Langhantel)', 'Trapez', ['lh'], 'small'),
  ex('shrug', 'Shrugs (Maschine)', 'Trapez', ['maschine'], 'small'),
  // Bizeps
  ex('biceps', 'Bizepscurls (Kurzhantel)', 'Bizeps', ['kh'], 'isolation'),
  ex('biceps', 'Bizepscurls (Langhantel)', 'Bizeps', ['lh'], 'isolation', { avoid: ['handgelenk'] }),
  ex('biceps', 'Kabelcurls', 'Bizeps', ['kabel'], 'isolation'),
  ex('biceps', 'Hammercurls', 'Bizeps', ['kh'], 'isolation'),
  ex('biceps', 'Scottcurls (Maschine)', 'Bizeps', ['maschine'], 'isolation'),
  ex('biceps', 'Schrägbankcurls', 'Bizeps', ['kh', 'bank'], 'isolation'),
  ex('biceps', 'Curls mit Band', 'Bizeps', ['band'], 'isolation'),
  // Trizeps
  ex('triceps', 'Trizepsdrücken (Kabel)', 'Trizeps', ['kabel'], 'isolation'),
  ex('triceps', 'Überkopf-Trizepsdrücken (Kabel)', 'Trizeps', ['kabel'], 'isolation', { avoid: ['ellbogen'] }),
  ex('triceps', 'French Press', 'Trizeps', ['kh'], 'isolation', { avoid: ['ellbogen', 'handgelenk'] }),
  ex('triceps', 'Enges Bankdrücken', 'Trizeps', ['lh', 'bank'], 'compound', { s: ['Brust'], avoid: ['ellbogen', 'schulter'] }),
  ex('triceps', 'Dips-Maschine', 'Trizeps', ['maschine'], 'compound', { s: ['Brust'], avoid: ['schulter'] }),
  ex('triceps', 'Trizeps-Kickbacks', 'Trizeps', ['kh'], 'isolation'),
  ex('triceps', 'Dips an der Bank', 'Trizeps', ['kg'], 'compound', { avoid: ['schulter', 'handgelenk'] }),
  ex('triceps', 'Trizepsdrücken mit Band', 'Trizeps', ['band'], 'isolation'),
  // Bauch
  ex('core', 'Cable Crunch', 'Bauch', ['kabel'], 'small', { avoid: ['ruecken'] }),
  ex('core', 'Beinheben (hängend)', 'Bauch', ['stange'], 'small'),
  ex('core', 'Bauchmaschine', 'Bauch', ['maschine'], 'small'),
  ex('core', 'Plank', 'Bauch', ['kg'], 'small', { timed: true }),
  ex('core', 'Crunches', 'Bauch', ['kg'], 'small'),
  ex('core', 'Ab Wheel', 'Bauch', ['kg'], 'small', { avoid: ['ruecken'] }),
  ex('core', 'Dead Bug', 'Bauch', ['kg'], 'small'),
  // Adduktoren
  ex('adductor', 'Adduktoren-Maschine', 'Adduktoren', ['maschine'], 'isolation'),
  ex('adductor', 'Adduktoren am Kabel', 'Adduktoren', ['kabel'], 'isolation'),
  ex('adductor', 'Sumo-Kniebeuge', 'Adduktoren', ['kh'], 'compound', { s: ['Quadrizeps', 'Po'], avoid: ['knie'] }),
  ex('adductor', 'Copenhagen Plank', 'Adduktoren', ['kg'], 'small', { timed: true }),
]

const FIRST_BY_NAME = new Map<string, CatalogExercise>()
for (const c of CATALOG) if (!FIRST_BY_NAME.has(c.name)) FIRST_BY_NAME.set(c.name, c)

/** Katalog-Eintrag zu einem Übungsnamen (für Muskeln und Volumen im Log). */
export function catalogExercise(name: string): CatalogExercise | undefined {
  return FIRST_BY_NAME.get(name)
}

/** Alle Übungsnamen, nach Hauptmuskel gruppiert - für Favoriten/Ausschlüsse. */
export function catalogByMuscle(): { muscle: VolumeMuscle; names: string[] }[] {
  return VOLUME_MUSCLES.map((muscle) => ({ muscle, names: [...new Set(CATALOG.filter((c) => c.p === muscle).map((c) => c.name))] })).filter((g) => g.names.length > 0)
}

export const LIFT_LABELS: Record<Lift, string> = {
  kniebeuge: 'Kniebeuge',
  kreuzheben: 'Kreuzheben',
  bankdruecken: 'Bankdrücken',
  klimmzuege: 'Klimmzüge',
  schulterdruecken: 'Schulterdrücken (Langhantel)',
}
const ALL_LIFTS = Object.keys(LIFT_LABELS) as Lift[]

const EQUIPMENT: Record<'studio' | 'basic' | 'zuhause', Equipment[]> = {
  studio: ['lh', 'kh', 'kg', 'band', 'stange', 'bank', 'kabel', 'maschine'],
  basic: ['lh', 'kh', 'kg', 'band', 'stange', 'bank', 'kabel'],
  zuhause: ['kh', 'kg', 'band'],
}

export const LOCATION_LABELS: Record<'studio' | 'basic' | 'zuhause', { label: string; hint: string }> = {
  studio: { label: 'Voll ausgestattetes Studio', hint: 'Maschinen, Kabelzüge, Lang- und Kurzhanteln' },
  basic: { label: 'Basic-Studio', hint: 'Hanteln, Bank, Kabelzug, Klimmzugstange – kaum Maschinen' },
  zuhause: { label: 'Zuhause', hint: 'Kurzhanteln, Bänder und Körpergewicht' },
}

/* ------------------------------------------------------------------------------------------
 * Splits und Einheiten
 * ---------------------------------------------------------------------------------------- */

const DAY_TEMPLATES: Record<string, Slot[]> = {
  'Ganzkörper A': ['squat', 'hpush', 'hpull', 'hinge', 'vpush', 'core', 'biceps', 'triceps'],
  'Ganzkörper B': ['hinge', 'vpull', 'incline', 'lunge', 'lateral', 'core', 'triceps', 'biceps'],
  'Ganzkörper C': ['lunge', 'hpush', 'vpull', 'glute', 'rear', 'core', 'calves', 'biceps'],
  'Oberkörper A': ['hpush', 'hpull', 'vpush', 'vpull', 'lateral', 'biceps', 'triceps', 'rear'],
  'Unterkörper A': ['squat', 'hinge', 'lunge', 'hamstring', 'calves', 'core', 'glute'],
  'Oberkörper B': ['incline', 'vpull', 'hpull', 'lateral', 'rear', 'triceps', 'biceps', 'vpush'],
  'Unterkörper B': ['hinge', 'glute', 'lunge', 'squat', 'calves', 'core', 'hamstring'],
  'Push Fullbody': ['squat', 'hpush', 'vpush', 'lunge', 'lateral', 'triceps', 'core', 'calves'],
  'Pull Fullbody': ['hinge', 'vpull', 'hpull', 'hamstring', 'rear', 'biceps', 'glute', 'core'],
  Torso: ['hpush', 'hpull', 'vpush', 'vpull', 'lateral', 'rear', 'incline', 'core'],
  Limbs: ['squat', 'hinge', 'biceps', 'triceps', 'lunge', 'hamstring', 'calves', 'biceps'],
  'Brust & Rücken': ['hpush', 'vpull', 'incline', 'hpull', 'incline', 'core', 'rear'],
  'Schultern & Arme': ['vpush', 'biceps', 'triceps', 'lateral', 'biceps', 'triceps', 'rear'],
  Brust: ['hpush', 'incline', 'incline', 'hpush', 'core'],
  Rücken: ['vpull', 'hpull', 'vpull', 'hpull', 'rear', 'core'],
  Schultern: ['vpush', 'lateral', 'rear', 'vpush', 'core'],
  Arme: ['biceps', 'triceps', 'biceps', 'triceps', 'biceps', 'triceps'],
  Push: ['hpush', 'vpush', 'incline', 'lateral', 'triceps', 'core', 'triceps'],
  Pull: ['vpull', 'hpull', 'rear', 'biceps', 'hinge', 'core', 'biceps'],
  Beine: ['squat', 'hinge', 'lunge', 'hamstring', 'glute', 'calves', 'core'],
}

/** Welche Bewegung ein Schwerpunkt-Muskel bekommt, wenn die Einheit ihn sonst nicht trainiert. */
const FOCUS_SLOT: Record<VolumeMuscle, Slot> = {
  Brust: 'hpush',
  Rücken: 'hpull',
  Trapez: 'shrug',
  'Seitl./hint. Schulter': 'lateral',
  'Vord. Schulter': 'frontraise',
  Bizeps: 'biceps',
  Trizeps: 'triceps',
  Quadrizeps: 'squat',
  Beinbeuger: 'hamstring',
  Po: 'glute',
  Bauch: 'core',
  Waden: 'calves',
  Adduktoren: 'adductor',
}

/** Zweite Übung, wenn ein Muskel mit einer Übung je Einheit sein Wochenziel nicht erreicht. */
const EXTRA_SLOT: Partial<Record<VolumeMuscle, Slot[]>> = {
  Brust: ['incline', 'hpush'],
  Rücken: ['vpull', 'hpull'],
  Quadrizeps: ['lunge', 'squat'],
  Beinbeuger: ['hamstring', 'hinge'],
  'Seitl./hint. Schulter': ['lateral', 'rear'],
  Bizeps: ['biceps'],
  Trizeps: ['triceps'],
  Waden: ['calves'],
  Bauch: ['core'],
  Po: ['glute'],
}

export const SPLIT_LABELS: Record<Split, string> = {
  ganzkoerper: 'Ganzkörper',
  okuk: 'Oberkörper / Unterkörper',
  pushpullfb: 'Push Fullbody / Pull Fullbody',
  torsolimbs: 'Torso / Limbs',
  ppl: 'Push / Pull / Beine',
  pplokuk: 'Push / Pull / Beine + Ober-/Unterkörper',
  fbppl: 'Push Fullbody / Pull Fullbody + Push / Pull / Beine',
  okukarme: 'Ober-/Unterkörper ×2 + Schultern & Arme',
  torsolimbsfb: 'Torso / Limbs + Ganzkörper',
  fbokuk: 'Push Fullbody / Pull Fullbody + Ober-/Unterkörper',
  arnold: 'Arnold-Split (Brust & Rücken / Schultern & Arme / Beine)',
  bro: 'Bro-Split (Brust / Rücken / Beine / Schultern / Arme)',
}

/** Einheiten je Split - wiederholen sich reihum, wenn mehr Trainingstage geplant sind. */
export function splitDays(split: Split, dayCount: number): string[] {
  switch (split) {
    case 'ganzkoerper':
      return ['Ganzkörper A', 'Ganzkörper B', 'Ganzkörper C'].slice(0, Math.min(3, Math.max(2, dayCount)))
    case 'okuk':
      return dayCount >= 4 ? ['Oberkörper A', 'Unterkörper A', 'Oberkörper B', 'Unterkörper B'] : ['Oberkörper A', 'Unterkörper A']
    case 'pushpullfb':
      return ['Push Fullbody', 'Pull Fullbody']
    case 'torsolimbs':
      return ['Torso', 'Limbs']
    case 'ppl':
      return ['Push', 'Pull', 'Beine']
    case 'pplokuk':
      return ['Push', 'Pull', 'Beine', 'Oberkörper A', 'Unterkörper A']
    case 'fbppl':
      return ['Push Fullbody', 'Pull Fullbody', 'Push', 'Pull', 'Beine']
    case 'okukarme':
      return ['Oberkörper A', 'Unterkörper A', 'Oberkörper B', 'Unterkörper B', 'Schultern & Arme']
    case 'torsolimbsfb':
      return ['Torso', 'Limbs', 'Ganzkörper A']
    case 'fbokuk':
      return ['Push Fullbody', 'Pull Fullbody', 'Oberkörper A', 'Unterkörper A']
    case 'arnold':
      return ['Brust & Rücken', 'Schultern & Arme', 'Beine']
    case 'bro':
      return ['Brust', 'Rücken', 'Beine', 'Schultern', 'Arme']
  }
}

/** Passende Splits je Zahl der Trainingstage - der erste ist der Standard-Vorschlag. */
export function splitsFor(days: number): Split[] {
  if (days <= 2) return ['ganzkoerper', 'pushpullfb', 'torsolimbs', 'okuk']
  if (days === 3) return ['ganzkoerper', 'pushpullfb', 'ppl', 'arnold']
  if (days === 4) return ['okuk', 'pushpullfb', 'torsolimbs', 'fbokuk', 'ganzkoerper']
  if (days === 5) return ['pushpullfb', 'fbppl', 'ppl', 'pplokuk', 'okukarme', 'torsolimbsfb', 'fbokuk', 'bro', 'okuk']
  return ['ppl', 'arnold', 'pushpullfb', 'pplokuk', 'fbppl', 'okukarme']
}

/** Vorschlag je nach Trainingstagen und Erfahrung - Einsteiger bekommen die einfacheren Splits. */
export function suggestedSplit(days: number, experience: Experience): Split {
  if (experience === 'einsteiger') return days >= 4 ? 'okuk' : 'ganzkoerper'
  return splitsFor(days)[0]
}

type ScheduleInput = Pick<StartAnswers, 'scheduleMode' | 'trainingDays' | 'rotation'>

/** Trainingseinheiten pro Woche - bei Rotation im Schnitt (1 an / 1 aus = 3,5). */
export function sessionsPerWeek(a: ScheduleInput): number {
  if (a.scheduleMode === 'rotation') return (7 * a.rotation.on) / (a.rotation.on + a.rotation.off)
  return a.trainingDays.length
}

/** Splits passend zum Rhythmus: feste Tage nach Anzahl, Rotation nach Länge des Trainingsblocks. */
export function splitOptions(a: ScheduleInput): Split[] {
  if (a.scheduleMode !== 'rotation') return splitsFor(a.trainingDays.length)
  const on = a.rotation.on
  if (on <= 1) return ['ganzkoerper', 'pushpullfb', 'okuk', 'torsolimbs']
  if (on === 2) return ['okuk', 'pushpullfb', 'torsolimbs', 'ganzkoerper']
  if (on === 3) return ['ppl', 'arnold', 'pushpullfb', 'torsolimbsfb', 'okuk']
  if (on === 4) return ['okuk', 'fbokuk', 'ppl', 'pushpullfb', 'torsolimbs']
  return ['fbppl', 'pplokuk', 'okukarme', 'okuk', 'ppl', 'pushpullfb']
}

export function suggestedSplitFor(a: ScheduleInput & Pick<StartAnswers, 'experience'>): Split {
  if (a.scheduleMode !== 'rotation') return suggestedSplit(a.trainingDays.length, a.experience)
  if (a.experience === 'einsteiger') return a.rotation.on <= 1 ? 'ganzkoerper' : 'okuk'
  return splitOptions(a)[0]
}

export function effectiveSplit(a: ScheduleInput & Pick<StartAnswers, 'experience' | 'split'>): Split {
  return a.split && splitOptions(a).includes(a.split) ? a.split : suggestedSplitFor(a)
}

export interface Unit {
  /** Eindeutiger Name, z.B. „Push Fullbody A“. */
  key: string
  /** Vorlage, z.B. „Push Fullbody“. */
  base: string
  variant: 0 | 1
}

/**
 * Die Einheiten des Plans. Mit A/B-Varianten bekommt eine Einheit, die mindestens zweimal pro
 * Woche drankommt, eine zweite Fassung mit anderen Übungen.
 */
export function planUnits(a: StartAnswers): Unit[] {
  const s = settingsFor(a)
  const perWeek = sessionsPerWeek(a)
  const names = splitDays(effectiveSplit(a), Math.max(1, Math.round(perWeek)))
  if (s.variants !== 'ab' || perWeek / names.length < 2) return names.map((n) => ({ key: n, base: n, variant: 0 }))
  return [...names.map((n) => ({ key: `${n} · A`, base: n, variant: 0 as const })), ...names.map((n) => ({ key: `${n} · B`, base: n, variant: 1 as const }))]
}

/** Einheit je Trainingstag (feste Tage): eigene Zuordnung, sonst reihum. */
export function dayUnitIndexes(a: StartAnswers, unitCount: number): number[] {
  return [...a.trainingDays]
    .sort((x, y) => x - y)
    .map((_, i) => {
      const own = a.dayUnits?.[i]
      return own !== undefined && own >= 0 && own < unitCount ? own : i % Math.max(1, unitCount)
    })
}

/* ------------------------------------------------------------------------------------------
 * Einstellungen nach Erfahrung
 * ---------------------------------------------------------------------------------------- */

/** Stufe der Fragen: Einsteiger 1, Fortgeschrittene 2, Profis 3. */
export function tier(experience: Experience): 1 | 2 | 3 {
  return experience === 'einsteiger' ? 1 : experience === 'fortgeschritten' ? 2 : 3
}

export interface PlanSettings {
  trainingGoal: TrainingGoal
  preference: Preference
  favorites: string[]
  excluded: string[]
  maxSets: number
  setSeconds: number
  restCompound: number
  restIsolation: number
  mastered: Lift[]
  variants: 'gleich' | 'ab'
  zones: Partial<Record<VolumeMuscle, Zone>>
  equipment: Equipment[]
}

/** Was nicht gefragt wurde, bekommt einen sinnvollen Standard - ausgeblendete Antworten zählen nicht. */
export function settingsFor(a: StartAnswers): PlanSettings {
  const t = tier(a.experience)
  const trainingGoal = t >= 2 && a.trainingGoal ? a.trainingGoal : 'aufbau'
  const location = a.location === 'beides' ? 'studio' : a.location
  return {
    trainingGoal,
    preference: t >= 2 ? (a.preference ?? 'gemischt') : 'gemischt',
    favorites: t >= 2 ? (a.favorites ?? []) : [],
    excluded: t >= 2 ? (a.excluded ?? []) : [],
    maxSets: t >= 3 ? Math.min(25, Math.max(12, a.maxSets ?? 20)) : 20,
    setSeconds: t >= 3 ? (a.setSeconds ?? 45) : 45,
    restCompound: t >= 3 && a.restCompound ? a.restCompound : trainingGoal === 'kraft' ? 180 : 150,
    restIsolation: t >= 3 && a.restIsolation ? a.restIsolation : trainingGoal === 'kraft' ? 90 : 75,
    // Einsteiger bekommen die vereinfachten Varianten, Profis sagen selbst, was sie sicher können.
    mastered: t === 1 ? [] : t === 2 ? ALL_LIFTS : (a.mastered ?? ALL_LIFTS),
    variants: t >= 3 ? (a.variants ?? 'gleich') : 'gleich',
    zones: t >= 3 ? (a.volumeZones ?? {}) : {},
    equipment: EQUIPMENT[location],
  }
}

/* ------------------------------------------------------------------------------------------
 * Wochenvolumen
 * ---------------------------------------------------------------------------------------- */

const midMav = (l: Landmarks) => Math.round((l.mavLo + l.mavHi) / 2)

/** Ziel-Sätze pro Woche je Muskel - aus Ziel, Erfahrung, Schwerpunkt und (Profi) eigener Zone. */
export function weeklyTarget(muscle: VolumeMuscle, a: StartAnswers, focused: boolean): number {
  const l = LANDMARKS[muscle]
  const s = settingsFor(a)
  const beginner = a.experience === 'einsteiger'
  if (focused) return Math.min(l.mrv - 1, beginner ? l.mavLo + 2 : midMav(l) + 2)
  const zone = s.zones[muscle]
  if (zone) return zone === 'MV' ? l.mv : zone === 'MEV' ? l.mev : midMav(l)
  const byGoal = a.goal === 'aufbauen' ? midMav(l) : a.goal === 'recomp' ? Math.round((l.mev + l.mavLo) / 2) : l.mev
  if (!beginner) return byGoal
  return Math.min(byGoal, a.goal === 'aufbauen' ? l.mavLo : l.mev)
}

/** Zone eines Wochenvolumens für die Balken-Anzeige. */
export function zoneOf(muscle: VolumeMuscle, sets: number): 'unter MV' | 'MV' | 'MEV' | 'MAV' | 'MRV' {
  const l = LANDMARKS[muscle]
  if (sets >= l.mrv) return 'MRV'
  if (sets >= l.mavLo) return 'MAV'
  if (sets >= l.mev && l.mev > 0) return 'MEV'
  if (sets >= l.mv && l.mv > 0) return 'MV'
  return sets > 0 && l.mv === 0 ? 'MV' : 'unter MV'
}

/** Anteil eines Satzes für einen Muskel: Hauptmuskel 1, mitarbeitende Muskeln 0,5. */
export function muscleShare(e: Pick<CatalogExercise, 'p' | 's'>, muscle: VolumeMuscle): number {
  if (e.p === muscle) return 1
  return e.s?.includes(muscle) ? 0.5 : 0
}

/* ------------------------------------------------------------------------------------------
 * Plan bauen
 * ---------------------------------------------------------------------------------------- */

export interface PlanExercise {
  name: string
  sets: number
  reps: string
  restSeconds: number
  warmupSets: number
  note?: string
  focus: boolean
  muscle: VolumeMuscle
  /** Schlüssel für Tausch und ± Sätze in der Zusammenfassung. */
  key: string
  alternatives: string[]
  cardio?: boolean
}

export interface PlanDay {
  name: string
  exercises: PlanExercise[]
  minutes: number
  workSets: number
  maxSets: number
  focus: VolumeMuscle[]
}

export interface TrainingWeek {
  days: PlanDay[]
  /** Häufigkeit je Einheit pro Woche. */
  frequency: number[]
  volume: { muscle: VolumeMuscle; planned: number; target: number }[]
  warnings: string[]
  /** Feste Tage: Wochentag (0 = Mo) und Einheit. */
  schedule: { weekday: number; unit: number }[]
}

type Draft = { entry: CatalogExercise; slot: Slot; key: string; sets: number; focus: boolean; note?: string; alternatives: string[] }

function usable(c: CatalogExercise, a: StartAnswers, s: PlanSettings): boolean {
  return (
    c.eq.every((e) => s.equipment.includes(e)) &&
    !(c.avoid ?? []).some((r) => a.restrictions.includes(r)) &&
    !(c.tech && !s.mastered.includes(c.tech)) &&
    !s.excluded.includes(c.name)
  )
}

const isFree = (c: CatalogExercise) => !c.eq.includes('maschine') && !c.eq.includes('kabel')

/** Kandidaten eines Bewegungsmusters in Vorzugsreihenfolge: Favoriten, dann Vorliebe, dann Katalog. */
function candidates(slot: Slot, a: StartAnswers, s: PlanSettings): CatalogExercise[] {
  const list = CATALOG.filter((c) => c.slot === slot && usable(c, a, s))
  const rank = (c: CatalogExercise) => (s.favorites.includes(c.name) ? 0 : 2) + (s.preference === 'frei' ? (isFree(c) ? 0 : 1) : s.preference === 'maschinen' ? (isFree(c) ? 1 : 0) : 0)
  return list.map((c, i) => ({ c, i })).sort((x, y) => rank(x.c) - rank(y.c) || x.i - y.i).map((x) => x.c)
}

/** Kurzer Grund, warum diese Übung im Plan steht. */
function noteFor(pick: CatalogExercise, slot: Slot, a: StartAnswers, s: PlanSettings, focus: boolean, variant: 0 | 1): string | undefined {
  const top = CATALOG.find((c) => c.slot === slot && c.eq.every((e) => s.equipment.includes(e)))
  const parts: string[] = []
  if (focus) parts.push(`Schwerpunkt ${pick.p} – deshalb vorne`)
  if (s.favorites.includes(pick.name)) parts.push('Favorit')
  if (top && top.name !== pick.name) {
    if ((top.avoid ?? []).some((r) => a.restrictions.includes(r))) parts.push(`Schonend statt ${top.name}`)
    else if (top.tech && !s.mastered.includes(top.tech)) parts.push(`Einsteigerfreundlich statt ${top.name}`)
    else if (s.excluded.includes(top.name)) parts.push(`Statt ${top.name} (ausgeschlossen)`)
  }
  if (variant === 1) parts.push('Variante B')
  return parts.length ? parts.join(' · ') : undefined
}

export function repsFor(c: Pick<CatalogExercise, 'kind' | 'timed'>, goal: TrainingGoal): string {
  if (c.timed) return '30–60 s'
  const table: Record<Kind, Record<TrainingGoal, string>> = {
    compound: { kraft: '4-6', aufbau: '6-10', fitness: '10-15' },
    isolation: { kraft: '8-12', aufbau: '10-15', fitness: '12-20' },
    small: { kraft: '10-15', aufbau: '12-20', fitness: '15-20' },
  }
  return table[c.kind][goal]
}

const restFor = (c: CatalogExercise, s: PlanSettings) => (c.kind === 'compound' ? s.restCompound : s.restIsolation)

/** Minuten einer Einheit: Aufwärmsätze + je Satz Arbeitszeit und Pause + Cardio am Ende. */
function sessionSeconds(list: Draft[], s: PlanSettings, cardioMin: number): number {
  const active = list.filter((d) => d.sets > 0)
  const firstCompound = active.find((d) => d.entry.kind === 'compound')
  const warmup = firstCompound ? 2 * (s.setSeconds * 0.6 + 60) : 0
  return warmup + active.reduce((sum, d) => sum + d.sets * (s.setSeconds + restFor(d.entry, s)), 0) + cardioMin * 60
}

function cardioMinutesPerSession(a: StartAnswers): number {
  if (!a.cardio) return 0
  return Math.max(10, Math.round(a.cardioMinutes / Math.max(1, sessionsPerWeek(a)) / 5) * 5)
}

function cardioName(a: StartAnswers, s: PlanSettings): string {
  if (a.restrictions.includes('knie')) return 'Radfahren (Ergometer)'
  return s.equipment.includes('maschine') ? 'Crosstrainer' : 'Seilspringen'
}

/** Wochenvolumen aus allen Einheiten (Häufigkeit × Sätze × Anteil). */
function volumeOf(units: Draft[][], freq: number[]): Map<VolumeMuscle, number> {
  const v = new Map<VolumeMuscle, number>(VOLUME_MUSCLES.map((m) => [m, 0]))
  units.forEach((list, u) => {
    for (const d of list) {
      if (d.sets <= 0) continue
      for (const m of VOLUME_MUSCLES) {
        const share = muscleShare(d.entry, m)
        if (share) v.set(m, v.get(m)! + freq[u] * d.sets * share)
      }
    }
  })
  return v
}

export function buildTrainingWeek(a: StartAnswers): TrainingWeek {
  const s = settingsFor(a)
  const units = planUnits(a)
  const perWeek = sessionsPerWeek(a)
  const fixed = a.scheduleMode !== 'rotation'
  const dayIdx = fixed ? dayUnitIndexes(a, units.length) : []
  const freq = units.map((_, u) => (fixed ? dayIdx.filter((x) => x === u).length : perWeek / units.length))
  const focusOf = (u: Unit) => (a.focusByUnit?.[u.key] ?? []).slice(0, 2)
  const allFocus = new Set(units.flatMap((u) => (freq[units.indexOf(u)] > 0 ? focusOf(u) : [])))
  const target = new Map(VOLUME_MUSCLES.map((m) => [m, weeklyTarget(m, a, allFocus.has(m))]))

  // 1. Übungen je Einheit: Vorlage (+ Ergänzungen), fehlende Schwerpunkte, Schwerpunkte nach vorn.
  const buildUnit = (u: Unit, extra: { slot: Slot; muscle: VolumeMuscle }[]): Draft[] => {
    const focus = focusOf(u)
    const slots = [...DAY_TEMPLATES[u.base]]
    const mainMuscle = (sl: Slot) => candidates(sl, a, s)[0]?.p
    for (const x of extra) {
      const last = slots.map(mainMuscle).lastIndexOf(x.muscle)
      slots.splice(last === -1 ? slots.length : last + 1, 0, x.slot)
    }
    for (const m of focus) if (!slots.some((sl) => mainMuscle(sl) === m)) slots.push(FOCUS_SLOT[m])
    const used = new Set<string>()
    const seen = new Map<Slot, number>()
    const list: Draft[] = []
    for (const slot of slots) {
      const n = seen.get(slot) ?? 0
      seen.set(slot, n + 1)
      const key = `${u.key}|${slot}|${n}`
      const cands = candidates(slot, a, s).filter((c) => !used.has(c.name))
      if (cands.length === 0) continue
      const swap = a.exerciseSwaps?.[key]
      const variantPick = u.variant === 1 && cands.length > 1 ? cands[1] : cands[0]
      const pick = (swap && cands.find((c) => c.name === swap)) || variantPick
      used.add(pick.name)
      list.push({ entry: pick, slot, key, sets: 0, focus: false, alternatives: cands.map((c) => c.name), note: undefined })
    }
    // Schwerpunkte: erste passende Übung je Muskel nach vorn (in der gewählten Reihenfolge).
    const front: Draft[] = []
    for (const m of focus) {
      const hit = list.find((d) => d.entry.p === m && !front.includes(d))
      if (hit) {
        hit.focus = true
        front.push(hit)
      }
    }
    const ordered = [...front, ...list.filter((d) => !front.includes(d))]
    for (const d of ordered) d.note = noteFor(d.entry, d.slot, a, s, d.focus, u.variant)
    return ordered
  }

  // 2. Sätze aus dem Wochenziel: direkte Sätze je Muskel verteilt auf alle Übungen der Woche,
  // abzüglich des indirekten Volumens (halb) aus anderen Übungen.
  const allot = (drafts: Draft[][]) => {
    const directSlots = new Map<VolumeMuscle, number>()
    drafts.forEach((list, u) => list.forEach((d) => directSlots.set(d.entry.p, (directSlots.get(d.entry.p) ?? 0) + freq[u])))
    const perSlot = (m: VolumeMuscle, indirect: Map<VolumeMuscle, number>) =>
      Math.max(0, target.get(m)! - (indirect.get(m) ?? 0)) / Math.max(0.5, directSlots.get(m) ?? 1)
    const pass = (indirect: Map<VolumeMuscle, number>) =>
      drafts.forEach((list) =>
        list.forEach((d) => {
          const m = d.entry.p
          if (INDIRECT_ONLY.includes(m) && !allFocus.has(m)) {
            d.sets = 0
            return
          }
          let sets = Math.round(perSlot(m, indirect))
          if (sets === 1) sets = 2
          d.sets = Math.min(4, sets)
        }),
      )
    pass(new Map())
    const indirect = new Map<VolumeMuscle, number>()
    drafts.forEach((list, u) =>
      list.forEach((d) => {
        for (const m of d.entry.s ?? []) indirect.set(m, (indirect.get(m) ?? 0) + freq[u] * d.sets * 0.5)
      }),
    )
    pass(indirect)
    // Schwerpunkte: mindestens 2 Sätze, +1 Satz an ihrem Tag (höchstens 4).
    for (const list of drafts) for (const d of list) if (d.focus) d.sets = Math.min(4, Math.max(2, d.sets) + 1)
    return (m: VolumeMuscle) => perSlot(m, indirect)
  }

  const extras: { slot: Slot; muscle: VolumeMuscle }[][] = units.map(() => [])
  let drafts = units.map((u, i) => buildUnit(u, extras[i]))
  const need = allot(drafts)
  // Reichen 4 Sätze je Übung nicht fürs Wochenziel, bekommt die Einheit eine zweite Übung dafür.
  let added = false
  for (const m of VOLUME_MUSCLES) {
    if ((INDIRECT_ONLY.includes(m) && !allFocus.has(m)) || need(m) <= 4.5) continue
    drafts.forEach((list, u) => {
      if (freq[u] <= 0 || !list.some((d) => d.entry.p === m)) return
      const slot = EXTRA_SLOT[m]?.find((sl) => candidates(sl, a, s).some((c) => c.p === m && !list.some((d) => d.entry.name === c.name)))
      if (!slot) return
      extras[u].push({ slot, muscle: m })
      added = true
    })
  }
  if (added) {
    drafts = units.map((u, i) => buildUnit(u, extras[i]))
    allot(drafts)
  }

  // 3. Grenzen je Einheit: Satzgrenze und Zeit. Gekürzt wird bei Nicht-Schwerpunkten mit dem
  // größten Überschuss - erst bis MV, dann notfalls weiter.
  const cardioMin = cardioMinutesPerSession(a)
  const budget = a.durationMin * 60
  drafts.forEach((list, u) => {
    const over = () => {
      const sets = list.reduce((n, d) => n + d.sets, 0)
      return sets > s.maxSets || (sets > 0 && sessionSeconds(list, s, cardioMin) > budget)
    }
    let guard = 0
    while (over() && guard++ < 200) {
      const v = volumeOf(drafts, freq)
      const pickFrom = (onlyAboveMv: boolean, allowFocus: boolean) =>
        list
          .filter((d) => d.sets > 0 && (allowFocus || !d.focus))
          .filter((d) => !onlyAboveMv || v.get(d.entry.p)! - freq[u] * (d.sets === 2 ? 2 : 1) >= LANDMARKS[d.entry.p].mv)
          // Am besten versorgte Muskeln zuerst (Ist / Ziel), bei Gleichstand die spätere Übung.
          .map((d, i) => ({ d, i, surplus: v.get(d.entry.p)! / Math.max(1, target.get(d.entry.p)!) }))
          .sort((x, y) => y.surplus - x.surplus || y.i - x.i)[0]?.d
      const victim = pickFrom(true, false) ?? pickFrom(false, false) ?? pickFrom(false, true)
      if (!victim) break
      victim.sets = victim.sets <= 2 ? 0 : victim.sets - 1
    }
  })

  // 4. Eigene Satzzahlen aus der Zusammenfassung.
  for (const list of drafts)
    for (const d of list) {
      const own = a.setOverrides?.[d.key]
      if (own !== undefined) d.sets = Math.max(0, Math.min(4, own))
    }

  const days: PlanDay[] = units.map((u, i) => {
    const list = drafts[i].filter((d) => d.sets > 0)
    const firstCompound = list.find((d) => d.entry.kind === 'compound')
    const exercises: PlanExercise[] = list.map((d) => ({
      name: d.entry.name,
      sets: d.sets,
      reps: repsFor(d.entry, s.trainingGoal),
      restSeconds: restFor(d.entry, s),
      warmupSets: d === firstCompound ? 2 : 0,
      note: d.note,
      focus: d.focus,
      muscle: d.entry.p,
      key: d.key,
      alternatives: d.alternatives,
    }))
    if (cardioMin) exercises.push({ name: cardioName(a, s), sets: 1, reps: `${cardioMin} min`, restSeconds: 0, warmupSets: 0, focus: false, muscle: 'Waden', key: `${u.key}|cardio`, alternatives: [], cardio: true })
    return {
      name: u.key,
      exercises,
      minutes: Math.round(sessionSeconds(drafts[i], s, cardioMin) / 60),
      workSets: list.reduce((n, d) => n + d.sets, 0),
      maxSets: s.maxSets,
      focus: focusOf(u),
    }
  })

  const v = volumeOf(drafts, freq)
  const volume = VOLUME_MUSCLES.map((m) => ({ muscle: m, planned: Math.round(v.get(m)! * 2) / 2, target: target.get(m)! }))
  const schedule = fixed ? [...a.trainingDays].sort((x, y) => x - y).map((weekday, i) => ({ weekday, unit: dayIdx[i] })) : []
  const warnings = [...recoveryWarnings(a, drafts, units, schedule), ...limitWarnings(days)]
  return { days, frequency: freq, volume, warnings, schedule }
}

/** Kompatibel zum bisherigen Aufruf: nur die Einheiten. */
export function buildTrainingPlan(a: StartAnswers): PlanDay[] {
  return buildTrainingWeek(a).days
}

/* ------------------------------------------------------------------------------------------
 * Hinweise
 * ---------------------------------------------------------------------------------------- */

/** Nötige Pause: bis 6 Sätze 48 h, darüber 72 h; große Muskeln ab 8 Sätzen 24 h mehr. */
export function recoveryHours(muscle: VolumeMuscle, sets: number): number {
  const base = sets <= 6 ? 48 : 72
  return base + (BIG_MUSCLES.includes(muscle) && sets >= 8 ? 24 : 0)
}

function unitLoad(list: Draft[]): Map<VolumeMuscle, number> {
  const load = new Map<VolumeMuscle, number>()
  for (const d of list) {
    if (d.sets <= 0) continue
    for (const m of VOLUME_MUSCLES) {
      const share = muscleShare(d.entry, m)
      if (share) load.set(m, (load.get(m) ?? 0) + d.sets * share)
    }
  }
  return load
}

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function recoveryWarnings(a: StartAnswers, drafts: Draft[][], units: Unit[], schedule: { weekday: number; unit: number }[]): string[] {
  const loads = drafts.map(unitLoad)
  const out: string[] = []
  const check = (u1: number, u2: number, gapH: number, label: string) => {
    for (const m of VOLUME_MUSCLES) {
      const l1 = loads[u1]?.get(m) ?? 0
      const l2 = loads[u2]?.get(m) ?? 0
      if (l1 < 3 || l2 < 3) continue
      const need = recoveryHours(m, l1)
      if (gapH < need) out.push(`${m}: ${label} nur ${gapH} h Pause (empfohlen ${need} h)`)
    }
  }
  if (a.scheduleMode === 'rotation') {
    if (a.rotation.on >= 2 && units.length > 1)
      for (let i = 0; i < units.length; i++) {
        const j = (i + 1) % units.length
        check(i, j, 24, `${units[i].key} → ${units[j].key}`)
      }
  } else if (schedule.length > 1) {
    for (let i = 0; i < schedule.length; i++) {
      const cur = schedule[i]
      const next = schedule[(i + 1) % schedule.length]
      const gap = ((next.weekday - cur.weekday + 7) % 7 || 7) * 24
      check(cur.unit, next.unit, gap, `${WD[cur.weekday]} → ${WD[next.weekday]}`)
    }
  }
  return [...new Set(out)].slice(0, 4)
}

function limitWarnings(days: PlanDay[]): string[] {
  return days.filter((d) => d.workSets > d.maxSets).map((d) => `${d.name}: ${d.workSets} Sätze – mehr als deine Grenze von ${d.maxSets}`)
}

/* ------------------------------------------------------------------------------------------
 * Ist-Volumen aus dem Trainingslog
 * ---------------------------------------------------------------------------------------- */

const FROM_HEATMAP: Partial<Record<Muscle, VolumeMuscle>> = {
  Brust: 'Brust',
  'Vordere Schulter': 'Vord. Schulter',
  'Seitliche Schulter': 'Seitl./hint. Schulter',
  'Hintere Schulter': 'Seitl./hint. Schulter',
  Bizeps: 'Bizeps',
  Trizeps: 'Trizeps',
  Bauch: 'Bauch',
  'Seitlicher Bauch': 'Bauch',
  'Nacken/Trapez': 'Trapez',
  Latissimus: 'Rücken',
  'Unterer Rücken': 'Rücken',
  Po: 'Po',
  Quadrizeps: 'Quadrizeps',
  Beinbeuger: 'Beinbeuger',
  Adduktoren: 'Adduktoren',
  Waden: 'Waden',
}

/**
 * Sätze je Muskel aus erledigten Arbeitssätzen: Übungen aus dem Katalog mit mitarbeitenden
 * Muskeln (halb), andere über ihren Hauptmuskel.
 */
export function volumeFromRecords(records: { exercise: string; muscle: Muscle }[]): Map<VolumeMuscle, number> {
  const v = new Map<VolumeMuscle, number>(VOLUME_MUSCLES.map((m) => [m, 0]))
  for (const r of records) {
    const c = catalogExercise(r.exercise)
    if (c) {
      for (const m of VOLUME_MUSCLES) {
        const share = muscleShare(c, m)
        if (share) v.set(m, v.get(m)! + share)
      }
    } else {
      const m = FROM_HEATMAP[r.muscle]
      if (m) v.set(m, v.get(m)! + 1)
    }
  }
  return v
}

/** Ziele je Muskel aus den gespeicherten „Dein Start“-Antworten (mit Schwerpunkten). */
export function weeklyTargetsFor(a: StartAnswers): Map<VolumeMuscle, number> {
  const focus = new Set(Object.values(a.focusByUnit ?? {}).flat())
  return new Map(VOLUME_MUSCLES.map((m) => [m, weeklyTarget(m, a, focus.has(m))]))
}
