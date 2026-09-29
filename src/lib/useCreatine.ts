import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { isCreatine } from './water'

/** Ob im Supplementplan des Athleten Kreatin steht - erhöht das Trinkziel. */
export function useTakesCreatine(athleteId: string): boolean {
  return (
    useLiveQuery(async () => {
      const planIds = (await db.supplementPlans.where('athleteId').equals(athleteId).toArray()).map((p) => p.id)
      if (planIds.length === 0) return false
      const items = await db.supplementPlanItems.where('planId').anyOf(planIds).toArray()
      const supplements = await db.supplements.bulkGet([...new Set(items.map((i) => i.supplementId))])
      return supplements.some((s) => s && isCreatine(s.name))
    }, [athleteId]) ?? false
  )
}
