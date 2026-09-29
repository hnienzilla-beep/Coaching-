import { describe, expect, it } from 'vitest'
import { caloriesFromMacros } from './calculator'
import { quickMacros } from './quickEntry'

const target = { protein: 180, carbs: 200, fat: 80 }

describe('quickMacros', () => {
  it('nimmt angegebene Makros', () => {
    expect(quickMacros({ kcal: 999, protein: 40, carbs: 0, fat: 10 }, target)).toEqual({ protein: 40, carbs: 0, fat: 10 })
  })
  it('verteilt reine Kalorien im Verhältnis der Vorgabe', () => {
    const m = quickMacros({ kcal: 900 }, target)!
    expect(Math.round(caloriesFromMacros(m.protein, m.carbs, m.fat))).toBeGreaterThan(890)
    expect(Math.round(caloriesFromMacros(m.protein, m.carbs, m.fat))).toBeLessThan(910)
    expect(m.carbs).toBeGreaterThan(m.protein)
  })
  it('ohne Angaben nichts', () => {
    expect(quickMacros({}, target)).toBeUndefined()
  })
})
