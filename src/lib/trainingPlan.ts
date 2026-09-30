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
export type Zone = 'MV' | 'MEV' | 'MAV' | 'MRV'
export type ScheduleMode = 'fixed' | 'rotation'

/* ------------------------------------------------------------------------------------------
 * Volumen-Landmarken (Sätze pro Woche)
 * ---------------------------------------------------------------------------------------- */

export const VOLUME_MUSCLES = [
  'Brust',
  'Rücken',
  'Trapez',
  'Seitl. Schulter',
  'Hint. Schulter',
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
  // Die Tabelle nennt beide zusammen (MEV 8, MAV 16–22, MRV 26) - getrennt je Kopf die Hälfte.
  'Seitl. Schulter': { mv: 0, mev: 4, mavLo: 8, mavHi: 11, mrv: 13 },
  'Hint. Schulter': { mv: 0, mev: 4, mavLo: 8, mavHi: 11, mrv: 13 },
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
const INDIRECT_ONLY: VolumeMuscle[] = ['Vord. Schulter', 'Adduktoren']
const BIG_MUSCLES: VolumeMuscle[] = ['Quadrizeps', 'Beinbeuger', 'Rücken', 'Po']

/**
 * Höchstens so viele Sätze je Muskel und Training (ohne Fokus-Bonus): große Muskeln 8, Arme,
 * Waden, Bauch und Trapez 6, Schultern und Adduktoren 4. Der Rest der Woche verteilt sich auf
 * andere Tage.
 */
export function maxSetsPerSession(m: VolumeMuscle): number {
  if (['Brust', 'Rücken', 'Quadrizeps', 'Beinbeuger', 'Po'].includes(m)) return 8
  if (['Bizeps', 'Trizeps', 'Waden', 'Bauch', 'Trapez'].includes(m)) return 6
  return 4
}

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
  | 'fly'
  | 'legext'
  | 'rowwide'

/** lh Langhantel, kh Kurzhanteln, kg Körpergewicht, stange Klimmzugstange/Dipbarren. */
type Equipment = 'lh' | 'kh' | 'kg' | 'band' | 'stange' | 'bank' | 'kabel' | 'maschine'
type Kind = 'compound' | 'isolation' | 'small'

export interface CatalogExercise {
  name: string
  slot: Slot
  p: VolumeMuscle
  /** Zweiter Hauptmuskel - zählt voll (z.B. Po bei RDLs). */
  p2?: VolumeMuscle
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
  more: Partial<Pick<CatalogExercise, 'p2' | 's' | 'tech' | 'avoid' | 'timed'>> = {},
): CatalogExercise => ({ name, slot, p, eq, kind, ...more })

// Je Bewegungsmuster in Vorzugsreihenfolge („Gemischt“). Frei/Maschinen sortiert um.
export const CATALOG: CatalogExercise[] = [
  // Kniebeuge-Muster
  ex('squat', 'Beinpresse', 'Quadrizeps', ['maschine'], 'compound', { s: ['Po', 'Adduktoren'], avoid: ['knie'] }),
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
  ex('hinge', 'Rumänisches Kreuzheben', 'Beinbeuger', ['lh'], 'compound', { p2: 'Po', s: ['Rücken'], tech: 'kreuzheben', avoid: ['ruecken'] }),
  ex('hinge', 'Kreuzheben', 'Rücken', ['lh'], 'compound', { s: ['Po', 'Beinbeuger', 'Trapez'], tech: 'kreuzheben', avoid: ['ruecken'] }),
  ex('hinge', 'Rumänisches Kreuzheben (Kurzhantel)', 'Beinbeuger', ['kh'], 'compound', { p2: 'Po', avoid: ['ruecken'] }),
  ex('hinge', '45°-Hyperextension', 'Po', ['maschine'], 'compound', { s: ['Beinbeuger'] }),
  ex('hinge', 'Good Morning', 'Beinbeuger', ['lh'], 'compound', { p2: 'Po', s: ['Rücken'], tech: 'kreuzheben', avoid: ['ruecken'] }),
  ex('hinge', 'Einbeiniges Kreuzheben', 'Beinbeuger', ['kh'], 'compound', { p2: 'Po' }),
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
  ex('hamstring', 'Rumänisches Kreuzheben (Kurzhantel)', 'Beinbeuger', ['kh'], 'compound', { p2: 'Po', avoid: ['ruecken'] }),
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
  ex('hpush', 'Bankdrücken (Kurzhantel)', 'Brust', ['kh', 'bank'], 'compound', { s: ['Trizeps', 'Vord. Schulter'] }),
  ex('hpush', 'Bankdrücken', 'Brust', ['lh', 'bank'], 'compound', { s: ['Trizeps', 'Vord. Schulter'], tech: 'bankdruecken', avoid: ['schulter'] }),
  ex('hpush', 'Brustpresse (Maschine)', 'Brust', ['maschine'], 'compound', { s: ['Trizeps', 'Vord. Schulter'] }),
  ex('hpush', 'Smith-Maschine Bankdrücken', 'Brust', ['maschine'], 'compound', { s: ['Trizeps', 'Vord. Schulter'], avoid: ['schulter'] }),
  ex('hpush', 'Dips', 'Brust', ['stange'], 'compound', { s: ['Trizeps', 'Vord. Schulter'], avoid: ['schulter', 'ellbogen'] }),
  ex('hpush', 'Liegestütze', 'Brust', ['kg'], 'compound', { s: ['Trizeps', 'Vord. Schulter'], avoid: ['handgelenk'] }),
  ex('hpush', 'Kurzhantel-Bodendrücken', 'Brust', ['kh'], 'compound', { s: ['Trizeps'] }),
  ex('hpush', 'Butterfly (Maschine)', 'Brust', ['maschine'], 'isolation'),
  // Drücken schräg / Brust oben
  ex('incline', 'Schrägbankdrücken (Smith Maschine)', 'Brust', ['maschine'], 'compound', { s: ['Vord. Schulter', 'Trizeps'] }),
  ex('incline', 'Schrägbankdrücken', 'Brust', ['lh', 'bank'], 'compound', { s: ['Vord. Schulter', 'Trizeps'], tech: 'bankdruecken', avoid: ['schulter'] }),
  ex('incline', 'Kurzhantel-Schrägbankdrücken', 'Brust', ['kh', 'bank'], 'compound', { s: ['Vord. Schulter', 'Trizeps'] }),
  ex('incline', 'Schräge Brustpresse (Maschine)', 'Brust', ['maschine'], 'compound', { s: ['Vord. Schulter', 'Trizeps'] }),
  ex('incline', 'Kabel-Crossover', 'Brust', ['kabel'], 'isolation'),
  ex('incline', 'Kurzhantel-Fliegende', 'Brust', ['kh', 'bank'], 'isolation'),
  ex('incline', 'Butterfly (Maschine)', 'Brust', ['maschine'], 'isolation'),
  ex('incline', 'Liegestütze (Füße erhöht)', 'Brust', ['kg'], 'compound', { s: ['Vord. Schulter', 'Trizeps'], avoid: ['handgelenk'] }),
  ex('incline', 'Fliegende mit Band', 'Brust', ['band'], 'isolation'),
  // Drücken vertikal
  ex('vpush', 'Schulterdrücken', 'Vord. Schulter', ['maschine'], 'compound', { s: ['Trizeps', 'Seitl. Schulter'], avoid: ['schulter'] }),
  ex('vpush', 'Schulterdrücken (Kurzhantel)', 'Vord. Schulter', ['kh'], 'compound', { s: ['Trizeps', 'Seitl. Schulter'], avoid: ['schulter'] }),
  ex('vpush', 'Schulterdrücken (Langhantel)', 'Vord. Schulter', ['lh'], 'compound', { s: ['Trizeps', 'Seitl. Schulter'], tech: 'schulterdruecken', avoid: ['schulter', 'ruecken'] }),
  ex('vpush', 'Schulterpresse (Maschine)', 'Vord. Schulter', ['maschine'], 'compound', { s: ['Trizeps', 'Seitl. Schulter'], avoid: ['schulter'] }),
  ex('vpush', 'Arnold Press', 'Vord. Schulter', ['kh'], 'compound', { s: ['Trizeps', 'Seitl. Schulter'], avoid: ['schulter'] }),
  ex('vpush', 'Landmine Press', 'Vord. Schulter', ['lh'], 'compound', { s: ['Trizeps', 'Brust'] }),
  ex('vpush', 'Pike Push-ups', 'Vord. Schulter', ['kg'], 'compound', { s: ['Trizeps'], avoid: ['schulter', 'handgelenk'] }),
  ex('vpush', 'Seitheben', 'Seitl. Schulter', ['kh'], 'small'),
  // Vordere Schulter isoliert (nur als Schwerpunkt)
  ex('frontraise', 'Frontheben (Kurzhantel)', 'Vord. Schulter', ['kh'], 'small'),
  ex('frontraise', 'Frontheben am Kabel', 'Vord. Schulter', ['kabel'], 'small'),
  ex('frontraise', 'Frontheben mit Band', 'Vord. Schulter', ['band'], 'small'),
  // Seitliche Schulter
  ex('lateral', 'Seitheben', 'Seitl. Schulter', ['kh'], 'small'),
  ex('lateral', 'Seitheben am Kabel', 'Seitl. Schulter', ['kabel'], 'small'),
  ex('lateral', 'Seitheben (Maschine)', 'Seitl. Schulter', ['maschine'], 'small'),
  ex('lateral', 'Seitheben mit Band', 'Seitl. Schulter', ['band'], 'small'),
  ex('lateral', 'Aufrechtes Rudern', 'Seitl. Schulter', ['lh'], 'isolation', { s: ['Trapez'], avoid: ['schulter'] }),
  // Hintere Schulter
  ex('rear', 'Reverse kablefly (einarmig)', 'Hint. Schulter', ['kabel'], 'small'),
  ex('rear', 'Face Pulls', 'Hint. Schulter', ['kabel'], 'small', { s: ['Trapez'] }),
  ex('rear', 'Reverse Butterfly', 'Hint. Schulter', ['maschine'], 'small'),
  ex('rear', 'Vorgebeugtes Seitheben', 'Hint. Schulter', ['kh'], 'small'),
  ex('rear', 'Face Pulls mit Band', 'Hint. Schulter', ['band'], 'small'),
  // Ziehen vertikal
  ex('vpull', 'Latzug', 'Rücken', ['kabel'], 'compound', { s: ['Bizeps', 'Hint. Schulter'] }),
  ex('vpull', 'Front Latpulldown', 'Rücken', ['kabel'], 'compound', { s: ['Bizeps', 'Hint. Schulter'] }),
  ex('vpull', 'Klimmzüge', 'Rücken', ['stange'], 'compound', { s: ['Bizeps', 'Hint. Schulter'], tech: 'klimmzuege', avoid: ['schulter', 'ellbogen'] }),
  ex('vpull', 'Latzug (eng)', 'Rücken', ['kabel'], 'compound', { s: ['Bizeps'] }),
  ex('vpull', 'Klimmzüge (assistiert)', 'Rücken', ['maschine'], 'compound', { s: ['Bizeps'], avoid: ['ellbogen'] }),
  ex('vpull', 'Überzüge am Kabel', 'Rücken', ['kabel'], 'isolation'),
  ex('vpull', 'Kurzhantelrudern (einarmig)', 'Rücken', ['kh'], 'compound', { s: ['Bizeps', 'Hint. Schulter'] }),
  ex('vpull', 'Latziehen mit Band', 'Rücken', ['band'], 'compound', { s: ['Bizeps'] }),
  // Ziehen horizontal
  ex('hpull', 'Rudern (Maschine) (einarmig)', 'Rücken', ['maschine'], 'compound', { s: ['Bizeps', 'Hint. Schulter'] }),
  ex('hpull', 'T-Bar', 'Rücken', ['lh'], 'compound', { s: ['Bizeps', 'Trapez', 'Hint. Schulter'], avoid: ['ruecken'] }),
  ex('hpull', 'Kabelrudern (sitzend)', 'Rücken', ['kabel'], 'compound', { s: ['Bizeps', 'Hint. Schulter', 'Trapez'] }),
  ex('hpull', 'Langhantelrudern', 'Rücken', ['lh'], 'compound', { s: ['Bizeps', 'Hint. Schulter', 'Trapez'], avoid: ['ruecken'] }),
  ex('hpull', 'Brustgestütztes Rudern (Maschine)', 'Rücken', ['maschine'], 'compound', { s: ['Bizeps', 'Hint. Schulter', 'Trapez'] }),
  ex('hpull', 'Kurzhantelrudern (einarmig)', 'Rücken', ['kh'], 'compound', { s: ['Bizeps', 'Hint. Schulter'] }),
  ex('hpull', 'Umgekehrtes Rudern', 'Rücken', ['stange'], 'compound', { s: ['Bizeps', 'Hint. Schulter'] }),
  ex('hpull', 'Rudern mit Band', 'Rücken', ['band'], 'compound', { s: ['Bizeps'] }),
  // Nacken / Trapez: Rudervarianten mit breitem Griff zuerst (mittlerer Trapez), dann Shrugs (oberer)
  ex('rowwide', 'T-Bar', 'Trapez', ['lh'], 'compound', { s: ['Rücken', 'Hint. Schulter'], avoid: ['ruecken'] }),
  ex('rowwide', 'Kabelrudern (breit, zur Brust)', 'Trapez', ['kabel'], 'compound', { s: ['Rücken', 'Hint. Schulter'] }),
  ex('rowwide', 'Rudern breit (Maschine)', 'Trapez', ['maschine'], 'compound', { s: ['Rücken', 'Hint. Schulter'] }),
  ex('rowwide', 'Langhantelrudern (breiter Obergriff)', 'Trapez', ['lh'], 'compound', { s: ['Rücken', 'Hint. Schulter'], avoid: ['ruecken'] }),
  ex('rowwide', 'Seal Row', 'Trapez', ['lh', 'bank'], 'compound', { s: ['Rücken', 'Hint. Schulter'] }),
  ex('rowwide', 'Brustgestütztes Kurzhantelrudern (breit)', 'Trapez', ['kh', 'bank'], 'compound', { s: ['Rücken', 'Hint. Schulter'] }),
  ex('rowwide', 'Kabelrudern hoch (zum Gesicht)', 'Trapez', ['kabel'], 'isolation', { s: ['Hint. Schulter'] }),
  ex('rowwide', 'Rudern breit mit Band', 'Trapez', ['band'], 'compound', { s: ['Rücken', 'Hint. Schulter'] }),
  ex('shrug', 'T-Bar', 'Trapez', ['lh'], 'compound', { s: ['Rücken', 'Hint. Schulter'], avoid: ['ruecken'] }),
  ex('shrug', 'Kabelrudern (breit, zur Brust)', 'Trapez', ['kabel'], 'compound', { s: ['Rücken', 'Hint. Schulter'] }),
  ex('shrug', 'Rudern breit (Maschine)', 'Trapez', ['maschine'], 'compound', { s: ['Rücken', 'Hint. Schulter'] }),
  ex('shrug', 'Langhantelrudern (breiter Obergriff)', 'Trapez', ['lh'], 'compound', { s: ['Rücken', 'Hint. Schulter'], avoid: ['ruecken'] }),
  ex('shrug', 'Seal Row', 'Trapez', ['lh', 'bank'], 'compound', { s: ['Rücken', 'Hint. Schulter'] }),
  ex('shrug', 'Brustgestütztes Kurzhantelrudern (breit)', 'Trapez', ['kh', 'bank'], 'compound', { s: ['Rücken', 'Hint. Schulter'] }),
  ex('shrug', 'Kabelrudern hoch (zum Gesicht)', 'Trapez', ['kabel'], 'isolation', { s: ['Hint. Schulter'] }),
  ex('shrug', 'Rudern breit mit Band', 'Trapez', ['band'], 'compound', { s: ['Rücken', 'Hint. Schulter'] }),
  ex('shrug', 'Shrugs (Kurzhantel)', 'Trapez', ['kh'], 'small'),
  ex('shrug', 'Shrugs (Langhantel)', 'Trapez', ['lh'], 'small'),
  ex('shrug', 'Shrugs (Maschine)', 'Trapez', ['maschine'], 'small'),
  // Bizeps
  ex('biceps', 'Preacher Curls (kurzhantel)', 'Bizeps', ['kh', 'bank'], 'isolation'),
  ex('biceps', 'Hammercurls', 'Bizeps', ['kh'], 'isolation'),
  ex('biceps', 'Bizepscurls (Kurzhantel)', 'Bizeps', ['kh'], 'isolation'),
  ex('biceps', 'Bizepscurls (Langhantel)', 'Bizeps', ['lh'], 'isolation', { avoid: ['handgelenk'] }),
  ex('biceps', 'Kabelcurls', 'Bizeps', ['kabel'], 'isolation'),
  ex('biceps', 'Scottcurls (Maschine)', 'Bizeps', ['maschine'], 'isolation'),
  ex('biceps', 'Schrägbankcurls', 'Bizeps', ['kh', 'bank'], 'isolation'),
  ex('biceps', 'Curls mit Band', 'Bizeps', ['band'], 'isolation'),
  // Trizeps
  ex('triceps', 'Trizeps Extensions (einarmig)', 'Trizeps', ['kh'], 'isolation', { avoid: ['ellbogen'] }),
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
  // Brust isoliert
  ex('fly', 'Butterfly (Maschine)', 'Brust', ['maschine'], 'isolation'),
  ex('fly', 'Kabel-Crossover', 'Brust', ['kabel'], 'isolation'),
  ex('fly', 'Kurzhantel-Fliegende', 'Brust', ['kh', 'bank'], 'isolation'),
  ex('fly', 'Fliegende mit Band', 'Brust', ['band'], 'isolation'),
  // Quadrizeps isoliert
  ex('legext', 'Beinstrecker', 'Quadrizeps', ['maschine'], 'isolation', { avoid: ['knie'] }),
  ex('legext', 'Bulgarian Split Squat', 'Quadrizeps', ['kh'], 'compound', { s: ['Po', 'Adduktoren'], avoid: ['knie'] }),
  ex('legext', 'Ausfallschritte', 'Quadrizeps', ['kh'], 'compound', { s: ['Po'], avoid: ['knie'] }),
  ex('legext', 'Glute Bridge', 'Po', ['kg'], 'compound', { s: ['Beinbeuger'] }),
  // Adduktoren
  ex('adductor', 'Adductor (Maschine)', 'Adduktoren', ['maschine'], 'isolation'),
  ex('adductor', 'Adduktoren am Kabel', 'Adduktoren', ['kabel'], 'isolation'),
  ex('adductor', 'Sumo-Kniebeuge', 'Adduktoren', ['kh'], 'compound', { s: ['Quadrizeps', 'Po'], avoid: ['knie'] }),
  ex('adductor', 'Copenhagen Plank', 'Adduktoren', ['kg'], 'small', { timed: true }),
]

const FIRST_BY_NAME = new Map<string, CatalogExercise>()
const key = (n: string) => n.trim().toLowerCase()
for (const c of CATALOG) if (!FIRST_BY_NAME.has(key(c.name))) FIRST_BY_NAME.set(key(c.name), c)

/** Katalog-Eintrag zu einem Übungsnamen (für Muskeln und Volumen im Log). */
export function catalogExercise(name: string): CatalogExercise | undefined {
  return FIRST_BY_NAME.get(key(name))
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

// Reihenfolge = Priorität: Reicht Zeit oder Satzgrenze nicht, fällt zuerst die hinterste Übung
// weg. „hpull“ = Rudern eng, „rowwide“ = Rudern breit (Trapez).
const DAY_TEMPLATES: Record<string, Slot[]> = {
  // Ganzkörper: Beine, Brust, Rücken, Beinbeuger, Schulter, Arme, Waden/Bauch - B und C mit anderen Varianten
  'Ganzkörper A': ['squat', 'hpush', 'vpull', 'hamstring', 'lateral', 'biceps', 'triceps', 'calves', 'core'],
  'Ganzkörper B': ['squat', 'incline', 'hpull', 'hinge', 'lateral', 'biceps', 'triceps', 'calves', 'core'],
  'Ganzkörper C': ['squat', 'hpush', 'vpull', 'hamstring', 'rear', 'biceps', 'triceps', 'calves', 'core'],
  'Oberkörper A': ['incline', 'vpull', 'hpush', 'hpull', 'lateral', 'rear', 'biceps', 'triceps'],
  'Oberkörper B': ['incline', 'vpull', 'hpush', 'hpull', 'lateral', 'rear', 'biceps', 'triceps'],
  // Unterkörper A mit Quad-Fokus, B mit Beinbeuger-Fokus
  'Unterkörper A': ['squat', 'legext', 'hamstring', 'calves', 'core'],
  'Unterkörper B': ['hinge', 'hamstring', 'squat', 'legext', 'calves'],
  // Eigene Vorlagen
  'Push Fullbody': ['incline', 'hpush', 'fly', 'lateral', 'triceps', 'vpush', 'calves', 'adductor', 'squat', 'legext'],
  'Pull Fullbody': ['vpull', 'hpull', 'rowwide', 'rear', 'biceps', 'biceps', 'hamstring', 'core'],
  Torso: ['incline', 'vpull', 'hpush', 'hpull', 'fly', 'rowwide', 'rear', 'core'],
  Limbs: ['squat', 'legext', 'hamstring', 'lateral', 'biceps', 'triceps', 'calves', 'biceps'],
  'Brust & Rücken': ['incline', 'vpull', 'hpush', 'hpull', 'fly', 'rowwide', 'core'],
  'Schultern & Arme': ['lateral', 'vpush', 'rear', 'biceps', 'triceps', 'biceps', 'triceps', 'lateral'],
  Brust: ['incline', 'hpush', 'fly', 'fly', 'core'],
  Rücken: ['vpull', 'hpull', 'rowwide', 'vpull', 'rear'],
  Schultern: ['lateral', 'vpush', 'rear', 'lateral', 'rear'],
  Arme: ['biceps', 'triceps', 'biceps', 'triceps', 'biceps'],
  Push: ['incline', 'hpush', 'fly', 'lateral', 'triceps', 'vpush'],
  // Pull ohne Hüftstreckung (kein Rumänisches Kreuzheben) - die gehört an den Beine-Tag.
  Pull: ['vpull', 'hpull', 'rowwide', 'rear', 'biceps', 'biceps'],
  Beine: ['squat', 'legext', 'hamstring', 'hinge', 'calves', 'core'],
}

const LEG_SLOTS: Slot[] = ['squat', 'legext', 'lunge', 'hamstring', 'hinge', 'glute', 'calves', 'adductor']

/** Muskeln, die eine Einheit immer trainiert - ihre erste Übung wird nie gestrichen. */
const REQUIRED: Record<string, VolumeMuscle[]> = {
  'Push Fullbody': ['Waden', 'Quadrizeps', 'Adduktoren'],
  'Pull Fullbody': ['Beinbeuger', 'Bauch'],
}

/** Welche Bewegung ein Schwerpunkt-Muskel bekommt, wenn die Einheit ihn sonst nicht trainiert. */
const FOCUS_SLOT: Record<VolumeMuscle, Slot> = {
  Brust: 'hpush',
  Rücken: 'hpull',
  Trapez: 'shrug',
  'Seitl. Schulter': 'lateral',
  'Hint. Schulter': 'rear',
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
  Brust: ['incline', 'hpush', 'fly'],
  Rücken: ['vpull', 'hpull'],
  Trapez: ['shrug'],
  Quadrizeps: ['lunge', 'squat', 'legext'],
  Beinbeuger: ['hamstring', 'hinge'],
  'Seitl. Schulter': ['lateral'],
  'Hint. Schulter': ['rear'],
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


/** Grund-Ziel (Sätze pro Woche) je Muskel - aus Ziel, Erfahrung und (Profi) eigener Zone. */
export function weeklyTarget(muscle: VolumeMuscle, a: StartAnswers): number {
  const l = LANDMARKS[muscle]
  const s = settingsFor(a)
  const beginner = a.experience === 'einsteiger'
  const zone = s.zones[muscle]
  if (zone) return zone === 'MV' ? l.mv : zone === 'MEV' ? l.mev : zone === 'MAV' ? l.mavLo : l.mavHi
  // Aufbauen: sicher im MAV (Untergrenze) - so ist das Ziel mit 3–5 Trainings auch erreichbar.
  const byGoal = a.goal === 'aufbauen' ? l.mavLo : a.goal === 'recomp' ? Math.round((l.mev + l.mavLo) / 2) : l.mev
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
export function muscleShare(e: Pick<CatalogExercise, 'p' | 'p2' | 's'>, muscle: VolumeMuscle): number {
  if (e.p === muscle || e.p2 === muscle) return 1
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

type Draft = { entry: CatalogExercise; slot: Slot; key: string; sets: number; focus: boolean; required?: boolean; extra?: boolean; note?: string; alternatives: string[] }

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
  const focusOf = (u: Unit) => (a.focusByUnit?.[u.key] ?? []).filter((m) => m in LANDMARKS).slice(0, 2)
  // Grundvolumen je Muskel - Schwerpunkte erhöhen nur ihren Tag (siehe unten), nicht die ganze Woche.
  const target = new Map(VOLUME_MUSCLES.map((m) => [m, weeklyTarget(m, a)]))

  // 1. Übungen je Einheit: Vorlage (+ Ergänzungen), fehlende Schwerpunkte, Schwerpunkte nach vorn.
  const buildUnit = (u: Unit, extra: { slot: Slot; muscle: VolumeMuscle }[]): Draft[] => {
    const focus = focusOf(u)
    const slots = [...DAY_TEMPLATES[u.base]]
    const mainMuscle = (sl: Slot) => candidates(sl, a, s)[0]?.p
    const extraAt = new Set<number>()
    for (const x of extra) {
      const last = slots.map(mainMuscle).lastIndexOf(x.muscle)
      const at = last === -1 ? slots.length : last + 1
      slots.splice(at, 0, x.slot)
      // Spätere Positionen verschieben sich mit.
      const shifted = [...extraAt].map((i) => (i >= at ? i + 1 : i))
      extraAt.clear()
      for (const i of [...shifted, at]) extraAt.add(i)
    }
    for (const m of focus) if (!slots.some((sl) => mainMuscle(sl) === m)) slots.push(FOCUS_SLOT[m])
    // Beine: immer eine Kniebeuge-Übung (Grundübung) und Beinstrecker (Isolation), sobald die
    // Einheit Quadrizeps trainiert. Ein Ausfallschritt wird dafür zum Beinstrecker.
    const quadSlots: Slot[] = ['squat', 'lunge', 'legext']
    const firstQuad = slots.findIndex((sl) => quadSlots.includes(sl))
    if (firstQuad !== -1) {
      if (!slots.includes('legext')) {
        const lunge = slots.indexOf('lunge')
        if (lunge !== -1) slots[lunge] = 'legext'
        else slots.splice(slots.map((sl) => quadSlots.includes(sl)).lastIndexOf(true) + 1, 0, 'legext')
      }
      if (!slots.includes('squat')) slots.splice(firstQuad, 0, 'squat')
    }
    const legSlots = new Set<Slot>(firstQuad !== -1 ? ['squat', 'legext'] : [])
    const used = new Set<string>()
    const seen = new Map<Slot, number>()
    const list: Draft[] = []
    for (const [si, slot] of slots.entries()) {
      const n = seen.get(slot) ?? 0
      seen.set(slot, n + 1)
      const key = `${u.key}|${slot}|${n}`
      const cands = candidates(slot, a, s).filter((c) => !used.has(c.name))
      if (cands.length === 0) continue
      const swap = a.exerciseSwaps?.[key]
      // A/B-Varianten und Vorlagen „… B“/„… C“ nehmen die nächste Alternative.
      const byName = legSlots.has(slot) ? 0 : ['Oberkörper B', 'Ganzkörper B'].includes(u.base) ? 1 : u.base === 'Ganzkörper C' ? 2 : 0
      const vi = u.variant === 1 && !legSlots.has(slot) ? 1 : byName
      const variantPick = cands[Math.min(vi, cands.length - 1)]
      const pick = (swap && cands.find((c) => c.name === swap)) || variantPick
      used.add(pick.name)
      // Pflicht-Muskel der Einheit: die erste Übung dafür bleibt immer drin.
      const required =
        ((REQUIRED[u.base] ?? []).includes(pick.p) && !list.some((d) => d.required && d.entry.p === pick.p)) ||
        (legSlots.has(slot) && !list.some((d) => d.slot === slot))
      list.push({ entry: pick, slot, key, sets: 0, focus: false, required, extra: extraAt.has(si), alternatives: cands.map((c) => c.name), note: undefined })
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

  // 2. Sätze: Jeder Muskel bekommt EINEN Anteil je Einheit (`share`) - an allen Tagen, die ihn
  // trainieren, gleich viel. Gekürzt wird immer an diesem Anteil, also überall gleich. Am Fokus-Tag
  // kommt ein Satz obendrauf (mindestens 3). Innerhalb einer Einheit teilt sich der Anteil auf
  // ihre Übungen für den Muskel auf (je 2–4 Sätze, bei wenig Volumen weniger Übungen).
  const focusIn = (u: number) => new Set(focusOf(units[u]))
  const unitTotal = (m: VolumeMuscle, u: number, share: Map<VolumeMuscle, number>) =>
    focusIn(u).has(m) ? Math.max(2, share.get(m) ?? 0) + 1 : (share.get(m) ?? 0)
  const distribute = (list: Draft[], u: number, share: Map<VolumeMuscle, number>) => {
    for (const m of new Set(list.map((d) => d.entry.p))) {
      const own = list.filter((d) => d.entry.p === m)
      const total = unitTotal(m, u, share)
      const used = total <= 0 ? 0 : Math.min(own.length, Math.max(1, Math.floor(total / 2)))
      own.forEach((d, i) => {
        if (i >= used) d.sets = 0
        else d.sets = Math.min(4, Math.max(2, Math.floor(total / used) + (i < total % used ? 1 : 0)))
      })
    }
    // Pflicht-Muskeln der Einheit (z.B. Waden bei Push Fullbody): mindestens 2 Sätze.
    for (const d of list) if (d.required) d.sets = Math.max(2, d.sets)
  }
  const unitsWithOf = (drafts: Draft[][]) => {
    const w = new Map<VolumeMuscle, number>()
    drafts.forEach((list, u) => {
      for (const m of new Set(list.map((d) => d.entry.p))) w.set(m, (w.get(m) ?? 0) + freq[u])
    })
    return w
  }
  // Anteil aus dem Wochenziel abzüglich des indirekten Volumens (halb) aus anderen Übungen.
  const shareFrom = (drafts: Draft[][], indirect: Map<VolumeMuscle, number>) => {
    const w = unitsWithOf(drafts)
    const share = new Map<VolumeMuscle, number>()
    for (const m of VOLUME_MUSCLES) {
      let n = INDIRECT_ONLY.includes(m) ? 0 : Math.round(Math.max(0, target.get(m)! - (indirect.get(m) ?? 0)) / Math.max(0.5, w.get(m) ?? 1))
      // Jede Übung der Vorlage ist Struktur: mindestens 2 Sätze - gestrichen wird nur nach Priorität.
      if ((w.get(m) ?? 0) > 0) n = Math.max(2, n)
      share.set(m, Math.min(maxSetsPerSession(m), n))
    }
    return share
  }
  const indirectOf = (drafts: Draft[][]) => {
    const ind = new Map<VolumeMuscle, number>()
    drafts.forEach((list, u) =>
      list.forEach((d) => {
        for (const m of d.entry.s ?? []) ind.set(m, (ind.get(m) ?? 0) + freq[u] * d.sets * 0.5)
      }),
    )
    return ind
  }
  const allot = (drafts: Draft[][]) => {
    let share = shareFrom(drafts, new Map())
    drafts.forEach((list, u) => distribute(list, u, share))
    share = shareFrom(drafts, indirectOf(drafts))
    drafts.forEach((list, u) => distribute(list, u, share))
    return share
  }

  const allowedIn = (u: number) =>
    new Set<VolumeMuscle>([
      ...DAY_TEMPLATES[units[u].base].map((sl) => candidates(sl, a, s)[0]?.p).filter((m): m is VolumeMuscle => !!m),
      ...focusOf(units[u]),
      'Bauch',
      // Waden nur an Tagen mit Beinen (nie an Push oder Pull).
      ...(DAY_TEMPLATES[units[u].base].some((sl) => LEG_SLOTS.includes(sl)) ? (['Waden'] as const) : []),
    ])
  type Extras = { slot: Slot; muscle: VolumeMuscle }[][]
  // Ein Durchgang der Planung mit festen Zusatz-Übungen (`extras`).
  const plan = (extras: Extras) => {
    let drafts = units.map((u, i) => buildUnit(u, extras[i]))
    let share = allot(drafts)
    // Wochenziel einhalten: Reichen die Tage eines Muskels nicht (je Training höchstens 4 bzw. 8
    // Sätze), kommt er zusätzlich an die Tage mit dem meisten Platz.
    {
      const ind = indirectOf(drafts)
      let spread = false
      for (const m of VOLUME_MUSCLES) {
        if (INDIRECT_ONLY.includes(m)) continue
        const need = target.get(m)! - (ind.get(m) ?? 0)
        const trains = (u: number) => drafts[u].some((d) => d.entry.p === m) || extras[u].some((x) => x.muscle === m)
        let capacity = units.reduce((n, _, u) => n + (trains(u) ? freq[u] * maxSetsPerSession(m) : 0), 0)
        if (need <= capacity + 0.5) continue
        // Nur an Tage, die laut Split für den Muskel gedacht sind (Brust nie an Pull, Beine nie an
        // Push) - Bauch passt überall hin, Waden nur an Tage mit Beinen.
        const free = units
          .map((_, u) => u)
          .filter((u) => freq[u] > 0 && !trains(u) && allowedIn(u).has(m))
          .sort((x, y) => drafts[x].reduce((n, d) => n + d.sets, 0) - drafts[y].reduce((n, d) => n + d.sets, 0))
        for (const u of free) {
          if (need <= capacity + 0.5) break
          extras[u].push({ slot: FOCUS_SLOT[m], muscle: m })
          capacity += freq[u] * maxSetsPerSession(m)
          spread = true
        }
      }
      if (spread) {
        drafts = units.map((u, i) => buildUnit(u, extras[i]))
        share = allot(drafts)
      }
    }
    // Passt der Anteil (bzw. am Fokus-Tag Anteil + 1) nicht in die Übungen der Einheit (max. 4 je
    // Übung), bekommt sie eine zweite Übung für den Muskel.
    let added = false
    for (const m of VOLUME_MUSCLES) {
      drafts.forEach((list, u) => {
        const n = list.filter((d) => d.entry.p === m).length
        if (freq[u] <= 0 || n === 0 || unitTotal(m, u, share) <= 4 * n) return
        const slot = EXTRA_SLOT[m]?.find((sl) => candidates(sl, a, s).some((c) => c.p === m && !list.some((d) => d.entry.name === c.name)))
        if (!slot) return
        extras[u].push({ slot, muscle: m })
        added = true
      })
    }
    if (added) {
      drafts = units.map((u, i) => buildUnit(u, extras[i]))
      share = allot(drafts)
    }

    // Gleich viel an jedem Tag heißt: nicht mehr, als die knappste Einheit fassen kann (4 je Übung,
    // am Fokus-Tag einer weniger für den Bonus-Satz).
    const capOf = (m: VolumeMuscle) => {
      let cap = maxSetsPerSession(m)
      drafts.forEach((list, u) => {
        const n = list.filter((d) => d.entry.p === m).length
        if (freq[u] > 0 && n > 0) cap = Math.min(cap, 4 * n - (focusIn(u).has(m) ? 1 : 0))
      })
      return cap
    }
    for (const m of VOLUME_MUSCLES) if (capOf(m) < (share.get(m) ?? 0)) share.set(m, capOf(m))
    drafts.forEach((l, i) => distribute(l, i, share))

    // Ziel inkl. Schwerpunkt: je Fokus-Tag ein Satz mehr.
    const bonus = new Map<VolumeMuscle, number>()
    units.forEach((_, u) => {
      for (const m of focusIn(u)) bonus.set(m, (bonus.get(m) ?? 0) + freq[u])
    })
    const goal = (m: VolumeMuscle) => target.get(m)! + (bonus.get(m) ?? 0)

    // 3. Grenzen je Einheit (Satzgrenze, Zeit). Ist eine Einheit zu voll, sinkt der Anteil eines
    // Muskels - für ALLE Einheiten, damit die Verteilung gleich bleibt. Erst Muskeln, die dort nicht
    // Fokus sind, am besten versorgte zuerst; erst Sätze abbauen, dann Übungen streichen.
    const cardioMin = cardioMinutesPerSession(a)
    const budget = a.durationMin * 60
    const setsIn = (list: Draft[]) => list.reduce((n, d) => n + d.sets, 0)
    const over = (list: Draft[]) => setsIn(list) > s.maxSets || (setsIn(list) > 0 && sessionSeconds(list, s, cardioMin) > budget)
    const lowered = (m: VolumeMuscle) => {
      const n = (share.get(m) ?? 0) - 1
      return n === 1 ? 0 : Math.max(0, n)
    }
    let guard = 0
    for (let u = drafts.findIndex(over); u !== -1 && guard++ < 300; u = drafts.findIndex(over)) {
      const list = drafts[u]
      const v = volumeOf(drafts, freq)
      const w = unitsWithOf(drafts)
      const fu = focusIn(u)
      // Was ein kleinerer Anteil in dieser Einheit bringt (Sätze weniger, Übung gestrichen?).
      const effect = (m: VolumeMuscle) => {
        const own = list.filter((d) => d.entry.p === m)
        const before = own.map((d) => d.sets)
        const trial = new Map(share).set(m, lowered(m))
        const copy = own.map((d) => ({ ...d }))
        const probe = list.map((d) => copy[own.indexOf(d)] ?? { ...d })
        distribute(probe, u, trial)
        const after = own.map((d) => probe[list.indexOf(d)].sets)
        const saved = before.reduce((x, y) => x + y, 0) - after.reduce((x, y) => x + y, 0)
        const drops = before.filter((b, i) => b > 0 && after[i] === 0).length
        const dropsTemplate = own.filter((d, i) => before[i] > 0 && after[i] === 0 && !d.extra).length
        return { saved, drops, dropsTemplate }
      }
      const cands = [...new Set(list.filter((d) => d.sets > 0).map((d) => d.entry.p))]
        .filter((m) => (share.get(m) ?? 0) > 0)
        .map((m) => ({ m, e: effect(m), ratio: v.get(m)! / Math.max(1, goal(m)), aboveMv: v.get(m)! - (w.get(m) ?? 0) >= LANDMARKS[m].mv }))
        .filter((c) => c.e.saved > 0)
      // Nach Priorität: zuerst der Muskel mit der hintersten Übung der Einheit - erst bei Muskeln
      // über ihrem Ziel, dann bei allen; Fokus-Muskeln zuletzt.
      const lastPos = (m: VolumeMuscle) => list.reduce((pos, d, i) => (d.entry.p === m && d.sets > 0 ? i : pos), -1)
      const pick = (ok: (c: (typeof cands)[number]) => boolean) =>
        cands.filter(ok).sort((x, y) => lastPos(y.m) - lastPos(x.m) || y.ratio - x.ratio)[0]
      // Erst Sätze abbauen, ohne Übungen zu streichen; danach Übungen nach Priorität streichen.
      const victim =
        pick((c) => !fu.has(c.m) && c.e.drops === 0 && c.ratio > 1) ??
        pick((c) => !fu.has(c.m) && c.e.drops === 0) ??
        pick((c) => c.e.drops === 0) ??
        pick((c) => !fu.has(c.m) && c.ratio > 1) ??
        pick((c) => !fu.has(c.m)) ??
        pick(() => true)
      if (!victim) break
      share.set(victim.m, lowered(victim.m))
      drafts.forEach((l, i) => distribute(l, i, share))
    }

    // Auffüllen: Muskeln unter ihrem Wert bekommen wieder mehr, solange an ALLEN ihren Tagen Platz
    // ist (Satzgrenze, Zeit, je Training 4 bzw. 8 Sätze, je Übung 4) - größte Lücke zuerst.
    const fits = () => drafts.every((l) => !over(l))
    const fillTo = (ceil: (m: VolumeMuscle) => number, withIndirect: boolean) => {
      for (let round = 0; round < 80; round++) {
        const v = volumeOf(drafts, freq)
        const gaps = VOLUME_MUSCLES.filter(
          (m) => (withIndirect || !INDIRECT_ONLY.includes(m)) && v.get(m)! + 0.5 < ceil(m) && (share.get(m) ?? 0) < capOf(m),
        ).sort((x, y) => v.get(x)! / Math.max(1, ceil(x)) - v.get(y)! / Math.max(1, ceil(y)))
        let grown = false
        for (const m of gaps) {
          const before = share.get(m) ?? 0
          const next = before === 0 ? 2 : before + 1
          if (next > capOf(m)) continue
          share.set(m, next)
          drafts.forEach((l, i) => distribute(l, i, share))
          const gained = volumeOf(drafts, freq).get(m)! > v.get(m)!
          if (fits() && gained) {
            grown = true
            break
          }
          share.set(m, before)
          drafts.forEach((l, i) => distribute(l, i, share))
        }
        if (!grown) break
      }
    }
    // 1. Erst jedes Wochenziel.
    fillTo(goal, false)
    // 2. Dann freie Zeit in den Einheiten nutzen: mehr Sätze für die Übungen der Vorlage bis zur
    // Obergrenze des Ziel-Bereichs - beim Aufbau bis zur Mitte des MAV, bei Recomp bis zur
    // MAV-Untergrenze, sonst zwischen MEV und MAV. Nie über MRV; Trapez, vordere Schulter und
    // Adduktoren bleiben indirekt (außer als Fokus/Pflicht).
    const ceiling = (m: VolumeMuscle) => {
      const l = LANDMARKS[m]
      const zone = s.zones[m]
      const top = zone === 'MV' ? l.mev : zone === 'MEV' ? l.mavLo : zone === 'MAV' ? l.mavHi : zone === 'MRV' ? l.mrv - 1 : a.goal === 'aufbauen' ? Math.round((l.mavLo + l.mavHi) / 2) : a.goal === 'recomp' ? l.mavLo : Math.round((l.mev + l.mavLo) / 2)
      return Math.max(goal(m), Math.min(l.mrv - 1, top))
    }
    fillTo(ceiling, true)
    return { drafts, goal, cardioMin, over }
  }

  // Nach dem Kürzen: Muskeln unter dem Wochenziel kommen zusätzlich an passende Tage, die noch
  // Platz haben (z.B. Bauch an Push, wenn der Beine-Tag voll ist) - dann neu planen.
  const extras: Extras = units.map(() => [])
  let result = plan(extras)
  for (let pass = 0; pass < 3; pass++) {
    const v = volumeOf(result.drafts, freq)
    let added = false
    for (const m of VOLUME_MUSCLES) {
      if (INDIRECT_ONLY.includes(m) || v.get(m)! + 0.5 >= result.goal(m)) continue
      units.forEach((_, u) => {
        const list = result.drafts[u]
        const sets = list.reduce((n, d) => n + d.sets, 0)
        if (freq[u] <= 0 || !allowedIn(u).has(m) || list.some((d) => d.entry.p === m && d.sets > 0) || extras[u].some((x) => x.muscle === m)) return
        if (sets + 2 > s.maxSets) return
        extras[u].push({ slot: FOCUS_SLOT[m], muscle: m })
        added = true
      })
    }
    if (!added) break
    result = plan(extras)
  }
  const { drafts, goal, cardioMin } = result

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
  const volume = VOLUME_MUSCLES.map((m) => ({ muscle: m, planned: Math.round(v.get(m)! * 2) / 2, target: Math.round(goal(m)) }))
  const schedule = fixed ? [...a.trainingDays].sort((x, y) => x - y).map((weekday, i) => ({ weekday, unit: dayIdx[i] })) : []
  // Wochenziel nicht erreicht (z.B. Satzgrenze oder Zeit zu knapp): sagen, wie viel fehlt.
  const missing = volume.filter((x) => !INDIRECT_ONLY.includes(x.muscle) && x.planned + 0.5 < x.target)
  const missWarnings = missing.length
    ? [
        `Unter dem Wochenziel: ${missing.map((x) => `${x.muscle} ${x.planned}/${x.target}`).join(', ')} – mehr Trainingstage, mehr Zeit oder eine höhere Satzgrenze helfen.`,
      ]
    : []
  const warnings = [...missWarnings, ...recoveryWarnings(a, drafts, units, schedule), ...limitWarnings(days)]
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
  'Seitliche Schulter': 'Seitl. Schulter',
  'Hintere Schulter': 'Hint. Schulter',
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
export function volumeFromRecords(records: { exercise: string; muscle: Muscle; secondary?: boolean }[]): Map<VolumeMuscle, number> {
  const v = new Map<VolumeMuscle, number>(VOLUME_MUSCLES.map((m) => [m, 0]))
  // Zusatz-Einträge (zweiter Hauptmuskel) zählen hier nicht - der Katalog kennt die Anteile selbst.
  for (const r of records.filter((x) => !x.secondary)) {
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
  return new Map(buildTrainingWeek(a).volume.map((v) => [v.muscle, v.target]))
}
