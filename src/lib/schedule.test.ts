import { describe, expect, it } from 'vitest'
import { isRestDay, plannedUnitFor, weekdayOf } from './schedule'

describe('Wochenplan', () => {
  it('feste Tage', () => {
    const a = { trainingDays: [0, 2, 4], schedule: { mode: 'fixed' as const, dayPlans: [0, 1, 0] } }
    expect(weekdayOf('2026-09-28')).toBe(0) // Montag
    expect(isRestDay(a, '2026-09-28')).toBe(false)
    expect(isRestDay(a, '2026-09-29')).toBe(true)
    expect(plannedUnitFor(a, '2026-09-30')).toBe(1)
    expect(isRestDay({ trainingDays: [] }, '2026-09-29')).toBe(false)
  })
  it('Rotation 1 an / 1 aus und 2 an / 1 aus', () => {
    const r = { schedule: { mode: 'rotation' as const, on: 1, off: 1, start: '2026-09-28' } }
    expect(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'].map((d) => isRestDay(r, d))).toEqual([false, true, false, true])
    const r2 = { schedule: { mode: 'rotation' as const, on: 2, off: 1, start: '2026-09-28' } }
    expect(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'].map((d) => isRestDay(r2, d))).toEqual([false, false, true, false])
  })
})
