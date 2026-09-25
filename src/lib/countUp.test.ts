import { describe, expect, it } from 'vitest'
import { countUpValue, easeOutCubic } from './countUp'

describe('easeOutCubic', () => {
  it('läuft von 0 bis 1 und bleibt in den Grenzen', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(-1)).toBe(0)
    expect(easeOutCubic(2)).toBe(1)
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
  })
})

describe('countUpValue', () => {
  it('zählt vom Start- zum Zielwert', () => {
    expect(countUpValue(0, 2000, 0, 900)).toBe(0)
    expect(countUpValue(0, 2000, 900, 900)).toBe(2000)
    expect(countUpValue(0, 2000, 5000, 900)).toBe(2000)
    expect(countUpValue(80, 78, 900, 900)).toBe(78)
    const mid = countUpValue(0, 2000, 450, 900)
    expect(mid).toBeGreaterThan(1000)
    expect(mid).toBeLessThan(2000)
  })

  it('springt ohne Dauer sofort ans Ziel', () => {
    expect(countUpValue(0, 42, 0, 0)).toBe(42)
  })
})
