import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, setPrefs } from './prefs'
import { suggestedMeal } from './meals'

describe('suggestedMeal', () => {
  afterEach(() => setPrefs({ meals: DEFAULT_PREFS.meals }))
  it('nimmt die passende Mahlzeit, sonst die nächste eingeschaltete', () => {
    const at = (h: number) => new Date(2026, 8, 29, h, 0)
    expect(suggestedMeal(at(12))).toBe('Mittagessen')
    setPrefs({ meals: DEFAULT_PREFS.meals.map((m) => (m.slot === 'Mittagessen' ? { ...m, enabled: false } : m)) })
    expect(suggestedMeal(at(12))).toBe('Snack 2')
  })
})
