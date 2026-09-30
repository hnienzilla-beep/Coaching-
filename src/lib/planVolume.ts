import type { Athlete, Exercise, TrainingPlan, TrainingPlanExercise } from '../models/types'
import { coMuscles, primaryMuscle, type Muscle } from './muscles'
import { sessionsPerWeek } from './trainingPlan'
import { LANDMARKS, catalogExercise, muscleShare, recoveryHours, VOLUME_MUSCLES, type VolumeMuscle, type Zone } from './trainingPlan'

/*
 * Wochenvolumen eines selbst geplanten Trainingsplans: Sätze je Muskel pro Woche (Plan-Tag ×
 * wie oft er pro Woche vorkommt), verglichen mit der gewählten Zone MV/MEV/MAV/MRV.
 */

/** Reihenfolge der Anzeige: von oben nach unten am Körper. */
export const MUSCLE_ORDER: VolumeMuscle[] = [
  'Brust',
  'Rücken',
  'Trapez',
  'Vord. Schulter',
  'Seitl. Schulter',
  'Hint. Schulter',
  'Bizeps',
  'Trizeps',
  'Quadrizeps',
  'Beinbeuger',
  'Po',
  'Adduktoren',
  'Waden',
  'Bauch',
]

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
 * Anteil eines Satzes je Muskel: eigene Angaben der Übung (Haupt- und Nebenmuskeln) vor dem
 * Katalog, zuletzt Erkennung aus dem Namen. Hauptmuskel 1, mitarbeitende Muskeln ½.
 */
export function exerciseShares(ex: Pick<Exercise, 'name' | 'muscleGroup' | 'primaryMuscle' | 'secondaryMuscles'>): Map<VolumeMuscle, number> {
  const shares = new Map<VolumeMuscle, number>()
  const add = (m: VolumeMuscle | undefined, v: number) => m && shares.set(m, Math.max(shares.get(m) ?? 0, v))
  const own = ex.primaryMuscle !== undefined || (ex.secondaryMuscles?.length ?? 0) > 0
  const c = catalogExercise(ex.name)
  if (!own && c) {
    for (const m of VOLUME_MUSCLES) add(muscleShare(c, m) ? m : undefined, muscleShare(c, m))
    return shares
  }
  const p = primaryMuscle(ex)
  if (p) {
    add(FROM_HEATMAP[p], 1)
    for (const co of coMuscles(ex.name, p)) add(FROM_HEATMAP[co], 1)
  }
  for (const s of ex.secondaryMuscles ?? []) add(FROM_HEATMAP[s], 0.5)
  return shares
}

type ScheduleAthlete = Pick<Athlete, 'trainingDays' | 'schedule'>

/** Wie oft ein Plan-Tag pro Woche vorkommt: eigene Angabe, sonst aus Trainingstagen bzw. Rhythmus. */
export function planFrequencies(athlete: ScheduleAthlete, plans: TrainingPlan[]): Map<string, number> {
  const sorted = [...plans].sort((a, b) => a.order - b.order)
  const freq = new Map<string, number>()
  const s = athlete.schedule
  const days = [...(athlete.trainingDays ?? [])].sort((x, y) => x - y)
  sorted.forEach((p, i) => {
    let f = 1
    if (s?.mode === 'rotation') f = sessionsPerWeek({ scheduleMode: 'rotation', trainingDays: [], rotation: s }) / Math.max(1, sorted.length)
    else if (days.length > 0) {
      const map = s?.mode === 'fixed' && s.dayPlans?.length === days.length ? s.dayPlans : days.map((_, d) => d % sorted.length)
      f = map.filter((x) => x === i).length
    }
    freq.set(p.id, p.timesPerWeek !== undefined && p.timesPerWeek >= 0 ? p.timesPerWeek : f)
  })
  return freq
}

export interface Contribution {
  plan: string
  exercise: string
  sets: number
  share: number
  timesPerWeek: number
}

export interface PlanVolume {
  /** Sätze je Muskel pro Woche. */
  weekly: Map<VolumeMuscle, number>
  /** Sätze je Muskel je Plan-Tag (ein Durchgang). */
  perPlan: Map<string, Map<VolumeMuscle, number>>
  contributions: Map<VolumeMuscle, Contribution[]>
}

/** Wochenvolumen aus allen Plan-Tagen (Aufwärmsätze zählen nicht - sie stehen nicht in `sets`). */
export function planVolume(
  plans: TrainingPlan[],
  rows: TrainingPlanExercise[],
  exercises: Map<string, Pick<Exercise, 'name' | 'muscleGroup' | 'primaryMuscle' | 'secondaryMuscles'>>,
  freq: Map<string, number>,
): PlanVolume {
  const weekly = new Map<VolumeMuscle, number>(VOLUME_MUSCLES.map((m) => [m, 0]))
  const perPlan = new Map<string, Map<VolumeMuscle, number>>()
  const contributions = new Map<VolumeMuscle, Contribution[]>(VOLUME_MUSCLES.map((m) => [m, []]))
  for (const p of plans) {
    const own = new Map<VolumeMuscle, number>()
    const f = freq.get(p.id) ?? 1
    for (const r of rows.filter((x) => x.planId === p.id)) {
      const ex = exercises.get(r.exerciseId)
      if (!ex || r.sets <= 0) continue
      for (const [m, share] of exerciseShares(ex)) {
        own.set(m, (own.get(m) ?? 0) + r.sets * share)
        weekly.set(m, weekly.get(m)! + r.sets * share * f)
        contributions.get(m)!.push({ plan: p.phaseName, exercise: ex.name, sets: r.sets, share, timesPerWeek: f })
      }
    }
    perPlan.set(p.id, own)
  }
  return { weekly, perPlan, contributions }
}

/** Sätze-Bereich einer Zone. */
export function zoneRange(m: VolumeMuscle, zone: Zone): { lo: number; hi: number } {
  const l = LANDMARKS[m]
  if (zone === 'MV') return { lo: l.mv, hi: Math.max(l.mv, l.mev - 1) }
  if (zone === 'MEV') return { lo: l.mev, hi: Math.max(l.mev, l.mavLo - 1) }
  if (zone === 'MAV') return { lo: l.mavLo, hi: l.mavHi }
  return { lo: l.mavHi + 1, hi: l.mrv }
}

/** Standard-Zone aus dem Hauptziel (Aufbauen MAV, sonst MEV). */
export function defaultZone(goal: string | undefined): Zone {
  return goal === 'aufbauen' ? 'MAV' : 'MEV'
}

/** unter = unter der Zone, ok = in der Zone, drueber = darüber (≤ MRV), zuviel = über MRV. */
export function volumeStatus(m: VolumeMuscle, sets: number, zone: Zone): 'unter' | 'ok' | 'drueber' | 'zuviel' {
  const { lo, hi } = zoneRange(m, zone)
  if (sets > LANDMARKS[m].mrv) return 'zuviel'
  if (sets + 0.25 < lo) return 'unter'
  if (sets > hi + 0.25) return 'drueber'
  return 'ok'
}

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

/** Zu wenig Pause für einen Muskel zwischen zwei aufeinanderfolgenden Trainingstagen. */
export function pauseWarnings(athlete: ScheduleAthlete, plans: TrainingPlan[], perPlan: Map<string, Map<VolumeMuscle, number>>): string[] {
  const sorted = [...plans].sort((a, b) => a.order - b.order)
  if (sorted.length === 0) return []
  const out: string[] = []
  const check = (a: TrainingPlan, b: TrainingPlan, gapH: number, label: string) => {
    for (const m of MUSCLE_ORDER) {
      const l1 = perPlan.get(a.id)?.get(m) ?? 0
      const l2 = perPlan.get(b.id)?.get(m) ?? 0
      if (l1 < 3 || l2 < 3) continue
      const need = recoveryHours(m, l1)
      if (gapH < need) out.push(`${m}: ${label} nur ${gapH} h Pause (empfohlen ${need} h)`)
    }
  }
  const s = athlete.schedule
  if (s?.mode === 'rotation') {
    if (s.on >= 2 && sorted.length > 1)
      for (let i = 0; i < sorted.length; i++) {
        const a = sorted[i]
        const b = sorted[(i + 1) % sorted.length]
        check(a, b, 24, `${a.phaseName} → ${b.phaseName}`)
      }
  } else {
    const days = [...(athlete.trainingDays ?? [])].sort((x, y) => x - y)
    if (days.length > 1) {
      const map = s?.mode === 'fixed' && s.dayPlans?.length === days.length ? s.dayPlans : days.map((_, d) => d % sorted.length)
      for (let i = 0; i < days.length; i++) {
        const j = (i + 1) % days.length
        const a = sorted[map[i]]
        const b = sorted[map[j]]
        if (!a || !b) continue
        const gap = ((days[j] - days[i] + 7) % 7 || 7) * 24
        check(a, b, gap, `${WD[days[i]]} → ${WD[days[j]]}`)
      }
    }
  }
  return [...new Set(out)].slice(0, 5)
}
