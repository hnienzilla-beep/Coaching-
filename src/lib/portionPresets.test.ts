import { describe, expect, it } from 'vitest'
import { DEFAULT_PORTIONS, normalizePortions, parsePortionList, suggestPortions } from './portionPresets'

describe('suggestPortions', () => {
  it('ohne Historie gelten die Standards', () => {
    expect(suggestPortions([], DEFAULT_PORTIONS)).toEqual({ presets: [50, 100, 150, 200], preferred: undefined, learned: [] })
  })

  it('stellt die häufigste Menge vor und füllt mit Standards auf', () => {
    const s = suggestPortions([80, 80, 120], DEFAULT_PORTIONS)
    expect(s.preferred).toBe(80)
    expect(s.learned).toEqual([80, 120])
    expect(s.presets).toEqual([50, 80, 100, 120])
  })

  it('bei Gleichstand gewinnt die zuletzt genutzte Menge', () => {
    expect(suggestPortions([60, 90], DEFAULT_PORTIONS).preferred).toBe(90)
  })

  it('höchstens drei gelernte Mengen, keine Doppelten mit den Standards', () => {
    const s = suggestPortions([30, 40, 45, 100, 100, 30], DEFAULT_PORTIONS)
    expect(s.learned).toEqual([30, 100, 45])
    expect(s.presets).toEqual([30, 45, 50, 100])
  })

  it('richtet die Zahl der Chips nach den Standards (4 bis 6)', () => {
    expect(suggestPortions([], [25, 50, 75, 100, 125, 150]).presets).toHaveLength(6)
  })
})

describe('normalizePortions', () => {
  it('sortiert, entfernt Doppelte und Ungültiges, höchstens sechs', () => {
    expect(normalizePortions([200, 50, 50, -1, Number.NaN, 30, 1, 2, 3, 4])).toEqual([1, 2, 3, 4, 30, 50])
  })
})

describe('eigene Mengen je Lebensmittel', () => {
  it('ersetzen Standards und gelernte Mengen', () => {
    const s = suggestPortions([80, 80], DEFAULT_PORTIONS, [60, 120, 180])
    expect(s.presets).toEqual([60, 120, 180])
    expect(s.preferred).toBe(60)
    expect(s.learned).toEqual([])
  })

  it('vorbelegt die häufigste Menge, wenn sie dazugehört', () => {
    expect(suggestPortions([40, 80, 80], DEFAULT_PORTIONS, [40, 60, 80]).preferred).toBe(80)
  })

  it('leere eigene Liste = Automatik', () => {
    expect(suggestPortions([], DEFAULT_PORTIONS, []).presets).toEqual(DEFAULT_PORTIONS)
  })

  it('parst Freitext', () => {
    expect(parsePortionList('80, 40 60;60')).toEqual([40, 60, 80])
    expect(parsePortionList('abc')).toEqual([])
  })
})
