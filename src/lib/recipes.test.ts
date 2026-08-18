import { describe, expect, it } from 'vitest'
import { recipeFactor, scaleGrams, servingsLabel, servingsOf } from './recipes'

describe('servingsOf', () => {
  it('nimmt eine Portion an, solange nichts Brauchbares gepflegt ist', () => {
    // Altbestand und frisch umgestellte Phasen haben kein servings - dann ist die im Log
    // eingegebene Portionszahl direkt der Faktor, "0,5" also das halbe Rezept.
    expect(servingsOf({ servings: undefined })).toBe(1)
    expect(servingsOf({ servings: 0 })).toBe(1)
    expect(servingsOf({ servings: -2 })).toBe(1)
    expect(servingsOf({ servings: Number.NaN })).toBe(1)
  })

  it('nimmt gepflegte Ausbeuten, auch gebrochene', () => {
    expect(servingsOf({ servings: 2 })).toBe(2)
    expect(servingsOf({ servings: 1.5 })).toBe(1.5)
  })
})

describe('recipeFactor', () => {
  it('teilt die gegessenen Portionen durch die Ausbeute', () => {
    expect(recipeFactor({ servings: 2 }, 1)).toBe(0.5)
    expect(recipeFactor({ servings: 2 }, 2)).toBe(1)
    expect(recipeFactor({ servings: 4 }, 3)).toBe(0.75)
  })

  it('behandelt die eingegebene Zahl ohne Ausbeute als Faktor', () => {
    expect(recipeFactor({ servings: undefined }, 0.5)).toBe(0.5)
    expect(recipeFactor({ servings: undefined }, 2)).toBe(2)
  })
})

describe('scaleGrams', () => {
  it('rundet auf eine Nachkommastelle', () => {
    // Ohne Rundung stünde ein Drittel von 1 g Salz als 0.3333333333333333 im Vault.
    expect(scaleGrams(1, 1 / 3)).toBe(0.3)
    expect(scaleGrams(150, 0.5)).toBe(75)
    expect(scaleGrams(180, 0.5)).toBe(90)
  })

  it('behält die halbe Portion des Schoko-Eis aufs Gramm', () => {
    const whole = [150, 60, 50, 180, 30, 10, 1]
    expect(whole.map((g) => scaleGrams(g, 0.5))).toEqual([75, 30, 25, 90, 15, 5, 0.5])
  })
})

describe('servingsLabel', () => {
  it('setzt Ein- und Mehrzahl und schreibt deutsch', () => {
    expect(servingsLabel(1)).toBe('1 Portion')
    expect(servingsLabel(2)).toBe('2 Portionen')
    expect(servingsLabel(0.5)).toBe('0,5 Portionen')
  })
})
