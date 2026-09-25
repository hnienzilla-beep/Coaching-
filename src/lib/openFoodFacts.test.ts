import { describe, expect, it } from 'vitest'
import { findExistingFood, foodFromOnline, mapHit, onlineFoodName } from './openFoodFacts'
import type { FoodItem } from '../models/types'

describe('mapHit', () => {
  it('übernimmt Name, Marke und Makros je 100 g und rechnet die kcal aus den Makros', () => {
    const food = mapHit({
      code: '4306188047162',
      product_name: 'Oat flakes',
      product_name_de: 'Haferflocken',
      brands: ['Jeden Tag'],
      nutriments: { proteins_100g: 14, carbohydrates_100g: 59, fat_100g: 7, 'energy-kcal_100g': 375 },
    })
    expect(food).toEqual({ barcode: '4306188047162', name: 'Haferflocken', brand: 'Jeden Tag', protein: 14, carbs: 59, fat: 7, kcal: 355 })
  })

  it('verwirft Treffer ohne vollständige Makros oder ohne Namen', () => {
    expect(mapHit({ code: '1', product_name: 'X', nutriments: { proteins_100g: 1, fat_100g: 1 } })).toBeUndefined()
    expect(mapHit({ code: '1', product_name: ' ', nutriments: { proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 } })).toBeUndefined()
    expect(mapHit({ product_name: 'X', nutriments: { proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 } })).toBeUndefined()
  })

  it('lässt eine Marke weg, die nur den Produktnamen wiederholt', () => {
    const food = mapHit({
      code: '1',
      product_name: 'Haferflocken',
      brands: ['Bio Rinatura Haferflocken', 'Rinatura'],
      nutriments: { proteins_100g: 13, carbohydrates_100g: 59, fat_100g: 7 },
    })
    expect(food?.brand).toBe('Rinatura')
  })

  it('liest Marken auch als Komma-Liste und Zahlen als Text', () => {
    const food = mapHit({
      code: '1',
      product_name: 'Skyr',
      brands: 'Arla, Arla Foods',
      nutriments: { proteins_100g: '11', carbohydrates_100g: '4', fat_100g: '0.2' },
    })
    expect(food).toMatchObject({ brand: 'Arla', protein: 11, carbs: 4, fat: 0.2 })
  })
})

describe('Übernahme in die eigene Datenbank', () => {
  const online = { barcode: '42', name: 'Skyr', brand: 'Arla', protein: 11, carbs: 4, fat: 0.2, kcal: 62 }

  it('benennt Einträge mit Marke in Klammern', () => {
    expect(onlineFoodName(online)).toBe('Skyr (Arla)')
    expect(onlineFoodName({ name: 'Skyr' })).toBe('Skyr')
  })

  it('findet vorhandene Einträge über Barcode, sonst über den Namen', () => {
    const byBarcode: FoodItem = { id: 'a', name: 'Mein Skyr', kcal: 0, protein: 0, carbs: 0, fat: 0, barcode: '42' }
    const byName: FoodItem = { id: 'b', name: ' skyr (arla) ', kcal: 0, protein: 0, carbs: 0, fat: 0 }
    expect(findExistingFood([byName, byBarcode], online)?.id).toBe('a')
    expect(findExistingFood([byName], online)?.id).toBe('b')
    expect(findExistingFood([], online)).toBeUndefined()
  })

  it('legt neue Einträge mit Quelle und Barcode an', () => {
    expect(foodFromOnline(online)).toMatchObject({ name: 'Skyr (Arla)', source: 'off', barcode: '42', protein: 11 })
  })
})
