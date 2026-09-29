import { describe, expect, it } from 'vitest'
import { isCreatine, waterGoalFor } from './water'

describe('waterGoalFor', () => {
  it('1 l je 20 kg Körpergewicht, auf 250 ml gerundet', () => {
    expect(waterGoalFor({ weightKg: 80 })).toBe(4000)
    expect(waterGoalFor({ weightKg: 70 })).toBe(3500)
    expect(waterGoalFor({ weightKg: 63 })).toBe(3250)
    expect(waterGoalFor({ weightKg: 80 }, 90)).toBe(4500)
  })
  it('Kreatin gibt 1 l obendrauf', () => {
    expect(waterGoalFor({ weightKg: 80 }, undefined, true)).toBe(5000)
  })
  it('eigenes Ziel gewinnt', () => {
    expect(waterGoalFor({ weightKg: 80, waterGoalMl: 3000 }, undefined, true)).toBe(3000)
  })
  it('erkennt Kreatin', () => {
    expect(isCreatine('Kreatin Monohydrat')).toBe(true)
    expect(isCreatine('Creatine HCL')).toBe(true)
    expect(isCreatine('Magnesium')).toBe(false)
  })
})
