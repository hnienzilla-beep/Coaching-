import { describe, expect, it } from 'vitest'
import { nextStep, nextTrainingPlan } from './nextStep'

const plan = (id: string, order: number) => ({ id, athleteId: 'a', phaseName: id, order })
const log = (date: string, trainingPlanId?: string) => ({ id: date, athleteId: 'a', date, trainingPlanId })

describe('nextTrainingPlan', () => {
  const plans = [plan('A', 0), plan('B', 1), plan('C', 2)]
  const all = new Set(['A', 'B', 'C'])
  it('rotiert nach dem letzten Tag', () => {
    expect(nextTrainingPlan(plans, all, [log('2026-09-27', 'B'), log('2026-09-25', 'A')], '2026-09-29')?.id).toBe('C')
    expect(nextTrainingPlan(plans, all, [log('2026-09-27', 'C')], '2026-09-29')?.id).toBe('A')
  })
  it('ohne Verlauf der erste, leere Tage übersprungen', () => {
    expect(nextTrainingPlan(plans, all, [], '2026-09-29')?.id).toBe('A')
    expect(nextTrainingPlan(plans, new Set(['B', 'C']), [log('2026-09-28', 'C')], '2026-09-29')?.id).toBe('B')
    expect(nextTrainingPlan(plans, new Set(), [], '2026-09-29')).toBeUndefined()
  })
})

describe('nextStep', () => {
  it('Reihenfolge', () => {
    expect(nextStep({ weighedToday: false, proteinLeft: 80, kcalLeft: 900, waterLeftMl: 1000, hour: 8 }).kind).toBe('weight')
    expect(nextStep({ weighedToday: false, proteinLeft: 80, kcalLeft: 900, waterLeftMl: 1000, hour: 15 }).kind).toBe('protein')
    expect(nextStep({ weighedToday: true, proteinLeft: 5, kcalLeft: 100, waterLeftMl: 500, hour: 15 }).text).toBe('Noch 0,5 l Wasser bis zum Ziel.')
    expect(nextStep({ weighedToday: true, proteinLeft: 0, kcalLeft: 0, waterLeftMl: 0, hour: 20 }).kind).toBe('done')
  })
})
