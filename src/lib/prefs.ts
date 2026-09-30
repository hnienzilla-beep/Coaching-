import { useSyncExternalStore } from 'react'
import { MEAL_TYPES } from '../models/types'

/*
 * Geräteweite Einstellungen an einem Ort (localStorage `coach.prefs`). Jede Änderung wirkt sofort
 * überall: React-Komponenten lesen über `usePrefs`, alles andere über `getPrefs`. Fehlende oder
 * kaputte Werte fallen auf die Standards zurück - neue Einstellungen brauchen keine Migration.
 */

export type TabKey = 'dashboard' | 'tracking' | 'ernaehrung' | 'training'
export type HintKey = 'weight' | 'protein' | 'kcal' | 'water'
export type TrackingValue = 'bodyFat' | 'measures' | 'extraMeasures' | 'sleep' | 'steps'
export type TrackingCard = 'wochenvergleich' | 'diagramm' | 'verlauf' | 'export'
export type NutritionCard = 'wasser' | 'tetris' | 'details' | 'verlauf'
export type TrainingCard = 'timer' | 'kraft' | 'notizen' | 'verlauf'
export type MealSlot = { slot: string; name: string; enabled: boolean }

export interface Prefs {
  tabOrder: TabKey[]
  hiddenTabs: TabKey[]
  startTab: TabKey
  hiddenSubViews: string[] // "ernaehrung:supplements"
  startSubView: Record<string, string> // ernaehrung → log
  dashboardOrder: string[]
  dashboardHidden: string[]
  hiddenHints: HintKey[]
  quickAddButton: boolean
  waterAmounts: number[] // ml
  storyAutoOpen: boolean
  trackingValues: TrackingValue[] // eingeschaltet
  trackingRange: '2w' | '1m' | '3m' | 'all'
  trackingHidden: TrackingCard[]
  meals: MealSlot[]
  nutritionHidden: NutritionCard[]
  gramStep: number
  kcalTolerance: number
  showRpe: boolean
  /** Muskel-Heatmap im Log und im Plan - standardmäßig aus, das Wochenvolumen im Plan ersetzt sie. */
  showHeatmap: boolean
  trainingHidden: TrainingCard[]
  weightUnit: 'kg' | 'lbs'
  lengthUnit: 'cm' | 'in'
  volumeUnit: 'ml' | 'oz'
  reminders: {
    weigh: { on: boolean; time: string }
    food: { on: boolean; time: string }
    water: { on: boolean; everyHours: number }
  }
  haptics: boolean
  confetti: boolean
  animations: 'full' | 'reduced' | 'off'
  fontSize: 's' | 'm' | 'l'
  contrast: 'normal' | 'high'
  tour: boolean
  toursSeen: string[]
}

/** Die acht Mahlzeiten-Plätze. Der Schlüssel steht in den Daten - der Name ist frei wählbar. */
export const MEAL_SLOTS = MEAL_TYPES
const DEFAULT_MEAL_COUNT = 7

export const DEFAULT_PREFS: Prefs = {
  tabOrder: ['dashboard', 'tracking', 'ernaehrung', 'training'],
  hiddenTabs: [],
  startTab: 'dashboard',
  hiddenSubViews: [],
  startSubView: { ernaehrung: 'log', training: 'log' },
  dashboardOrder: [],
  dashboardHidden: [],
  hiddenHints: [],
  quickAddButton: true,
  waterAmounts: [250, 500, 750],
  storyAutoOpen: true,
  trackingValues: ['bodyFat', 'measures'],
  trackingRange: '1m',
  trackingHidden: [],
  meals: MEAL_SLOTS.map((slot, i) => ({ slot, name: slot, enabled: i < DEFAULT_MEAL_COUNT })),
  nutritionHidden: [],
  gramStep: 10,
  kcalTolerance: 100,
  showRpe: true,
  showHeatmap: false,
  trainingHidden: [],
  weightUnit: 'kg',
  lengthUnit: 'cm',
  volumeUnit: 'ml',
  reminders: {
    weigh: { on: false, time: '07:30' },
    food: { on: false, time: '20:00' },
    water: { on: false, everyHours: 2 },
  },
  haptics: true,
  confetti: true,
  animations: 'full',
  fontSize: 'm',
  contrast: 'normal',
  tour: true,
  toursSeen: [],
}

const KEY = 'coach.prefs'
const listeners = new Set<() => void>()

function load(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>
    const merged = { ...DEFAULT_PREFS, ...raw, reminders: { ...DEFAULT_PREFS.reminders, ...(raw.reminders ?? {}) } }
    // Mahlzeiten: immer alle acht Plätze, in gespeicherter Reihenfolge der Namen.
    merged.meals = MEAL_SLOTS.map((slot, i) => {
      const saved = raw.meals?.find((m) => m.slot === slot)
      return { slot, name: saved?.name?.trim() || slot, enabled: saved?.enabled ?? i < DEFAULT_MEAL_COUNT }
    })
    // Übernahme der früheren Einzel-Speicher (Dashboard-Karten, Zeitraum).
    if (!raw.dashboardHidden) {
      const old = JSON.parse(localStorage.getItem('coach.dashboard.hidden') ?? '[]') as unknown
      if (Array.isArray(old)) merged.dashboardHidden = old.filter((x): x is string => typeof x === 'string')
    }
    if (!raw.trackingRange) {
      const old = localStorage.getItem('coach.tracking.range')
      if (old === '2w' || old === '1m' || old === '3m' || old === 'all') merged.trackingRange = old
    }
    return merged
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

let current: Prefs = typeof localStorage === 'undefined' ? DEFAULT_PREFS : load()

export function getPrefs(): Prefs {
  return current
}

export function setPrefs(patch: Partial<Prefs>): void {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Ohne Speicher gilt die Einstellung bis zum Neuladen.
  }
  listeners.forEach((l) => l())
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  setPrefs({ [key]: value } as Partial<Prefs>)
}

/** Setzt die genannten Einstellungen (oder alle) auf den Standard zurück. */
export function resetPrefs(keys?: (keyof Prefs)[]): void {
  if (!keys) {
    setPrefs({ ...DEFAULT_PREFS })
    return
  }
  const patch: Partial<Prefs> = {}
  for (const k of keys) (patch as Record<string, unknown>)[k] = DEFAULT_PREFS[k]
  setPrefs(patch)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Abo außerhalb von React (z.B. Darstellung am <html>). */
export const subscribePrefs = subscribe

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, getPrefs)
}

/** Umschalten eines Eintrags in einer Listen-Einstellung (z.B. ausgeblendete Karten). */
export function toggleInList<K extends keyof Prefs>(key: K, item: string, include: boolean): void {
  const list = (current[key] as unknown as string[]) ?? []
  const next = include ? [...new Set([...list, item])] : list.filter((x) => x !== item)
  setPref(key, next as unknown as Prefs[K])
}

/** Aktive Mahlzeiten in Reihenfolge, mit Anzeigenamen. */
export function activeMeals(prefs: Prefs = current): MealSlot[] {
  return prefs.meals.filter((m) => m.enabled)
}

/** Anzeigename eines gespeicherten Mahlzeiten-Schlüssels. */
export function mealLabel(slot: string, prefs: Prefs = current): string {
  return prefs.meals.find((m) => m.slot === slot)?.name ?? slot
}

/** Einträge nach gespeicherter Reihenfolge; neue (noch nicht sortierte) hinten an. */
export function sortByOrder<T extends { id: string }>(items: readonly T[], order: string[]): T[] {
  const pos = new Map(order.map((id, i) => [id, i]))
  const rank = (item: T) => pos.get(item.id) ?? 1000 + items.indexOf(item)
  return [...items].sort((a, b) => rank(a) - rank(b))
}
