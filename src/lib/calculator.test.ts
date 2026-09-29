import { describe, expect, it } from 'vitest'
import { deltaFromFirst, repairedFfmiBodyFat, smoothedValue } from './calculator'

type P = { v?: number }
const pts: P[] = [{ v: 20 }, {}, { v: 22 }, { v: 18 }, {}, { v: 21 }]

describe('smoothedValue', () => {
  it('mittelt über die letzten Messungen, Lücken zählen nicht', () => {
    expect(smoothedValue(pts, 0, 'v')).toBe(20)
    expect(smoothedValue(pts, 3, 'v')).toBe(20)
    expect(smoothedValue(pts, 5, 'v', 2)).toBe(19.5)
  })

  it('nur an Tagen mit Messung', () => {
    expect(smoothedValue(pts, 1, 'v')).toBeUndefined()
  })
})

describe('deltaFromFirst', () => {
  it('Differenz zur ersten Messung, gerundet', () => {
    expect(deltaFromFirst(pts, 0, 'v')).toBe(0)
    expect(deltaFromFirst(pts, 3, 'v')).toBe(-2)
    expect(deltaFromFirst([{ v: 84.3 }, { v: 80.8 }], 1, 'v')).toBe(-3.5)
    expect(deltaFromFirst(pts, 4, 'v')).toBeUndefined()
  })
})

describe('repairedFfmiBodyFat', () => {
  // FFMI 20, 180 cm → Magermasse 64,8 kg; Profilgewicht 80 kg → 19,0 % (der alte, falsche Wert)
  it('erkennt den alten Wert und rechnet mit dem Tagesgewicht neu', () => {
    expect(repairedFfmiBodyFat({ weightKg: 78, bodyFatPct: 19 }, 20, 80, 180)).toBe(16.9)
  })
  it('entfernt den Wert an Tagen ohne Gewicht', () => {
    expect(repairedFfmiBodyFat({ bodyFatPct: 19 }, 20, 80, 180)).toBeNull()
  })
  it('lässt andere Werte in Ruhe', () => {
    expect(repairedFfmiBodyFat({ weightKg: 78, bodyFatPct: 15.2 }, 20, 80, 180)).toBeUndefined()
    expect(repairedFfmiBodyFat({ weightKg: 80, bodyFatPct: 19 }, 20, 80, 180)).toBeUndefined()
    expect(repairedFfmiBodyFat({}, 20, 80, 180)).toBeUndefined()
  })
})
