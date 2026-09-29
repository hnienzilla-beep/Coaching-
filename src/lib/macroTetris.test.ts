import { describe, expect, it } from 'vitest'
import { suggestFill } from './macroTetris'

const skyr = { id: 'skyr', name: 'Skyr', protein: 11, carbs: 4, fat: 0.2 }
const banane = { id: 'banane', name: 'Banane', protein: 1, carbs: 20, fat: 0.3 }
const nuss = { id: 'nuss', name: 'Nüsse', protein: 20, carbs: 10, fat: 50 }

describe('suggestFill', () => {
  it('findet die Kombination, die Protein und Carbs trifft', () => {
    const remaining = { kcal: 450, protein: 45, carbs: 50, fat: 3 }
    const [best] = suggestFill(remaining, [
      { food: skyr, amounts: [150, 250, 400] },
      { food: banane, amounts: [100, 120, 200] },
      { food: nuss, amounts: [30, 50] },
    ])
    expect(best.parts.map((p) => p.food.id).sort()).toEqual(['banane', 'skyr'])
    expect(best.totals.kcal).toBeLessThanOrEqual(remaining.kcal + 120)
  })

  it('liefert verschiedene Lebensmittel-Kombinationen und nichts bei kleinem Rest', () => {
    const list = suggestFill({ kcal: 600, protein: 40, carbs: 60, fat: 20 }, [
      { food: skyr, amounts: [250, 500] },
      { food: banane, amounts: [120, 240] },
      { food: nuss, amounts: [30, 60] },
    ])
    const keys = list.map((s) => s.parts.map((p) => p.food.id).sort().join('+'))
    expect(new Set(keys).size).toBe(keys.length)
    expect(suggestFill({ kcal: 50, protein: 5, carbs: 5, fat: 1 }, [{ food: skyr, amounts: [100] }])).toEqual([])
  })
})
