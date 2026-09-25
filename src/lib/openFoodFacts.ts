// Online-Lebensmittelsuche über Open Food Facts (freie Datenbank, CORS-fähig, kein API-Key).
// FDDB bietet keine freie Schnittstelle an - Open Food Facts deckt deutsche Markenprodukte
// gut ab und liefert die Nährwerte bereits je 100 g, also im Format dieser App.

import { caloriesFromMacros } from './calculator'
import { findByName } from './names'
import type { FoodItem } from '../models/types'

const SEARCH_URL = 'https://search.openfoodfacts.org/search'

/** Ein Suchtreffer, schon auf das Datenmodell der App zugeschnitten (Werte je 100 g). */
export interface OnlineFood {
  barcode: string
  name: string
  brand?: string
  protein: number
  carbs: number
  fat: number
  kcal: number
}

interface OffHit {
  code?: string
  product_name?: string
  product_name_de?: string
  brands?: string[] | string
  nutriments?: Record<string, number | string | undefined>
}

function num(value: number | string | undefined): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Wandelt einen Treffer in ein `OnlineFood` um - `undefined`, wenn Name oder eine der drei
 * Makro-Angaben fehlt. Ohne vollständige Makros wäre der Eintrag im Log wertlos, und die
 * Kalorien rechnet die App wie überall sonst aus den Makros (statt `energy-kcal_100g` zu
 * übernehmen), damit Summen und Einzelwerte zusammenpassen.
 */
export function mapHit(hit: OffHit): OnlineFood | undefined {
  const name = (hit.product_name_de || hit.product_name || '').trim()
  const n = hit.nutriments ?? {}
  const protein = num(n.proteins_100g)
  const carbs = num(n.carbohydrates_100g)
  const fat = num(n.fat_100g)
  if (!name || !hit.code || protein === undefined || carbs === undefined || fat === undefined) return undefined

  const brands = Array.isArray(hit.brands) ? hit.brands : (hit.brands ?? '').split(',')
  // Die Marke wiederholt oft den Produktnamen ("Bio Rinatura Haferflocken") - dann bringt sie
  // nichts und bläht nur den Namen auf.
  const brand = brands.map((b) => b.trim()).find((b) => b && !b.toLowerCase().includes(name.toLowerCase()))

  return {
    barcode: hit.code,
    name,
    brand,
    protein: round1(protein),
    carbs: round1(carbs),
    fat: round1(fat),
    kcal: Math.round(caloriesFromMacros(protein, carbs, fat)),
  }
}

/** Name, unter dem ein Online-Treffer in der eigenen Datenbank landet. */
export function onlineFoodName(food: Pick<OnlineFood, 'name' | 'brand'>): string {
  return food.brand ? `${food.name} (${food.brand})` : food.name
}

/**
 * Sucht bei Open Food Facts. Doppelte Treffer (gleicher Name und gleiche Werte - bei Eigen-
 * marken häufig, je Handelskette ein Barcode) werden zusammengefasst.
 */
export async function searchOpenFoodFacts(query: string, signal?: AbortSignal): Promise<OnlineFood[]> {
  const params = new URLSearchParams({
    q: query,
    langs: 'de',
    page_size: '25',
    fields: 'code,product_name,product_name_de,brands,nutriments',
  })
  const res = await fetch(`${SEARCH_URL}?${params}`, { signal })
  if (!res.ok) throw new Error(`Open Food Facts: HTTP ${res.status}`)
  const data = (await res.json()) as { hits?: OffHit[] }

  const seen = new Set<string>()
  const result: OnlineFood[] = []
  for (const hit of data.hits ?? []) {
    const food = mapHit(hit)
    if (!food) continue
    const key = `${onlineFoodName(food).toLowerCase()}|${food.protein}|${food.carbs}|${food.fat}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(food)
  }
  return result
}

/**
 * Sucht einen passenden Eintrag in der eigenen Datenbank - zuerst über den Barcode, dann über
 * den Namen. So wird dasselbe Produkt nicht bei jeder Übernahme ein weiteres Mal angelegt.
 */
export function findExistingFood(foods: FoodItem[], online: OnlineFood): FoodItem | undefined {
  return foods.find((f) => f.barcode === online.barcode) ?? findByName(foods, onlineFoodName(online))
}

/** Neuer Datenbank-Eintrag aus einem Online-Treffer. */
export function foodFromOnline(online: OnlineFood): FoodItem {
  return {
    id: crypto.randomUUID(),
    name: onlineFoodName(online),
    kcal: online.kcal,
    protein: online.protein,
    carbs: online.carbs,
    fat: online.fat,
    source: 'off',
    barcode: online.barcode,
    brand: online.brand,
  }
}
