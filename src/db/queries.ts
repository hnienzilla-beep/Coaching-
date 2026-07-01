import { db } from './db'
import type { Athlete, DailyEntry, NutritionPlan, PlanMeal } from '../models/types'

export const ACCENT_COLORS = ['#a3e635', '#22d3ee', '#f472b6', '#fb923c', '#c084fc', '#facc15']

export function pickAccentColor(existingCount: number): string {
  return ACCENT_COLORS[existingCount % ACCENT_COLORS.length]
}

export async function createAthlete(partial: Omit<Athlete, 'id' | 'accentColor'>): Promise<Athlete> {
  const count = await db.athletes.count()
  const athlete: Athlete = {
    id: crypto.randomUUID(),
    accentColor: pickAccentColor(count),
    ...partial,
  }
  await db.athletes.add(athlete)
  await createDefaultPlans(athlete.id)
  return athlete
}

export async function createDefaultPlans(athleteId: string): Promise<void> {
  const phases = ['Phase 1', 'Phase 2', 'Phase 3']
  for (let i = 0; i < phases.length; i++) {
    const plan: NutritionPlan = {
      id: crypto.randomUUID(),
      athleteId,
      phaseName: phases[i],
      order: i,
    }
    await db.nutritionPlans.add(plan)
  }
}

export async function deleteAthlete(athleteId: string): Promise<void> {
  await db.transaction('rw', db.athletes, db.dailyEntries, db.nutritionPlans, db.planMeals, db.progressPhotos, async () => {
    const plans = await db.nutritionPlans.where('athleteId').equals(athleteId).toArray()
    for (const plan of plans) {
      await db.planMeals.where('planId').equals(plan.id).delete()
    }
    await db.nutritionPlans.where('athleteId').equals(athleteId).delete()
    await db.dailyEntries.where('athleteId').equals(athleteId).delete()
    await db.progressPhotos.where('athleteId').equals(athleteId).delete()
    await db.athletes.delete(athleteId)
  })
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return isoDate(d)
}

// Baut die vollständige Tagesreihe ab Startdatum bis heute (oder bis zum letzten Eintrag,
// je nachdem was später ist) - analog zur automatisch fortlaufenden Datumsspalte im Excel.
export async function getTrackingSeries(athleteId: string, startDate: string): Promise<DailyEntry[]> {
  const entries = await db.dailyEntries.where('athleteId').equals(athleteId).toArray()
  const byDate = new Map(entries.map((e) => [e.date, e]))

  const today = isoDate(new Date())
  const lastEntryDate = entries.reduce((max, e) => (e.date > max ? e.date : max), startDate)
  const endDate = lastEntryDate > today ? lastEntryDate : today

  const series: DailyEntry[] = []
  let cursor = startDate
  while (cursor <= endDate) {
    const existing = byDate.get(cursor)
    series.push(existing ?? { id: crypto.randomUUID(), athleteId, date: cursor })
    cursor = addDays(cursor, 1)
  }
  return series
}

export async function upsertDailyEntry(entry: DailyEntry): Promise<void> {
  const existing = await db.dailyEntries.where('[athleteId+date]').equals([entry.athleteId, entry.date]).first()
  if (existing) {
    await db.dailyEntries.update(existing.id, { ...entry, id: existing.id })
  } else {
    await db.dailyEntries.add(entry)
  }
}

export async function addPlanMeal(meal: PlanMeal): Promise<void> {
  await db.planMeals.add(meal)
}

export async function removePlanMeal(id: string): Promise<void> {
  await db.planMeals.delete(id)
}
