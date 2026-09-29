import { describe, expect, it } from 'vitest'
import { waterGoalFor } from './water'

describe('waterGoalFor', () => {
  it('35 ml je kg, auf 250 ml gerundet und begrenzt', () => {
    expect(waterGoalFor({ weightKg: 80 })).toBe(2750)
    expect(waterGoalFor({ weightKg: 40 })).toBe(2000)
    expect(waterGoalFor({ weightKg: 200 })).toBe(4500)
    expect(waterGoalFor({ weightKg: 80 }, 90)).toBe(3250)
  })
  it('eigenes Ziel gewinnt', () => {
    expect(waterGoalFor({ weightKg: 80, waterGoalMl: 3000 })).toBe(3000)
  })
})
