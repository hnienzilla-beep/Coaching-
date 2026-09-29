import type { MuscleGroup } from '../models/types'

export const HEAT_GROUPS = ['Brust', 'Rücken', 'Schultern', 'Arme', 'Bauch', 'Beine'] as const
export type HeatGroup = (typeof HEAT_GROUPS)[number]

/** Richtwert für Muskelaufbau: rund 10-20 harte Sätze je Muskelgruppe und Woche. */
export const WEEKLY_SET_TARGET = 12

/**
 * Erledigte Sätze je Muskelgruppe. Ganzkörper-Übungen zählen halb für jede Gruppe, "Sonstiges"
 * gar nicht.
 */
export function setsPerGroup(groups: MuscleGroup[]): Record<HeatGroup, number> {
  const result = Object.fromEntries(HEAT_GROUPS.map((g) => [g, 0])) as Record<HeatGroup, number>
  for (const g of groups) {
    if (g === 'Ganzkörper') for (const h of HEAT_GROUPS) result[h] += 0.5
    else if ((HEAT_GROUPS as readonly string[]).includes(g)) result[g as HeatGroup] += 1
  }
  return result
}

/** 0 (kalt) bis 1 (glüht) - ab dem Wochen-Richtwert voll. */
export function heatLevel(sets: number): number {
  return Math.max(0, Math.min(1, sets / WEEKLY_SET_TARGET))
}

export function volumeVerdict(sets: number): string {
  if (sets === 0) return 'fehlt'
  if (sets < 6) return 'wenig'
  if (sets < 10) return 'mittel'
  if (sets <= 20) return 'Ziel ✓'
  return 'sehr viel'
}
