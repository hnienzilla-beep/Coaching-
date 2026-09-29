import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS } from './prefs'
import { displayValue, formatUnit, fromDisplay } from './units'

const lbs = { ...DEFAULT_PREFS, weightUnit: 'lbs' as const, lengthUnit: 'in' as const, volumeUnit: 'oz' as const }

describe('units', () => {
  it('rechnet für die Anzeige um und zurück', () => {
    expect(displayValue(100, 'weight', 1, lbs)).toBe(220.5)
    expect(fromDisplay(220.462, 'weight', lbs)).toBeCloseTo(100, 2)
    expect(displayValue(2.54, 'length', 1, lbs)).toBe(1)
    expect(Math.round(displayValue(500, 'volume', 0, lbs)!)).toBe(17)
  })
  it('metrisch bleibt unverändert', () => {
    expect(formatUnit(82.5, 'weight', 1, DEFAULT_PREFS)).toBe('82,5 kg')
    expect(formatUnit(undefined, 'weight', 1, DEFAULT_PREFS)).toBe('–')
  })
})
