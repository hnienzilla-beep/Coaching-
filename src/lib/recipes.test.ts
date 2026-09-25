import { describe, expect, it } from 'vitest'
import { recipeFactor, recipeFactorFromGrams, recipeWeight, scaleGrams, servingsLabel, servingsOf } from './recipes'

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

describe('recipeWeight', () => {
  const meals = [{ grams: 150 }, { grams: 60 }, { grams: 40 }]

  it('nimmt das Fertiggewicht, wenn eins gepflegt ist', () => {
    expect(recipeWeight({ cookedWeightG: 1200 }, meals)).toBe(1200)
  })

  it('fällt sonst auf die Summe der Zutaten zurück', () => {
    expect(recipeWeight({ cookedWeightG: undefined }, meals)).toBe(250)
    expect(recipeWeight({ cookedWeightG: 0 }, meals)).toBe(250)
    expect(recipeWeight({ cookedWeightG: Number.NaN }, meals)).toBe(250)
    expect(recipeWeight({}, [])).toBe(0)
  })
})

describe('recipeFactorFromGrams', () => {
  it('rechnet die gegessene Menge in einen Anteil des Rezepts um', () => {
    expect(recipeFactorFromGrams(1200, 300)).toBe(0.25)
    expect(recipeFactorFromGrams(250, 250)).toBe(1)
  })

  it('liefert 0 für ein Rezept ohne Gewicht', () => {
    expect(recipeFactorFromGrams(0, 100)).toBe(0)
  })

  it('verteilt 300 g eines gekochten Gerichts anteilig auf die Zutaten', () => {
    // 500 g Nudeln + 300 g Sauce roh, gekocht 1200 g - 300 g davon ist ein Viertel.
    const factor = recipeFactorFromGrams(recipeWeight({ cookedWeightG: 1200 }, [{ grams: 500 }, { grams: 300 }]), 300)
    expect([500, 300].map((g) => scaleGrams(g, factor))).toEqual([125, 75])
  })
})

describe('servingsLabel', () => {
  it('setzt Ein- und Mehrzahl und schreibt deutsch', () => {
    expect(servingsLabel(1)).toBe('1 Portion')
    expect(servingsLabel(2)).toBe('2 Portionen')
    expect(servingsLabel(0.5)).toBe('0,5 Portionen')
  })
})
