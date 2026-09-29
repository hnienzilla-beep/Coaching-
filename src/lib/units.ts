import { getPrefs, usePrefs, type Prefs } from './prefs'

/*
 * Einheiten. Gespeichert wird immer metrisch (kg, cm, ml) - umgerechnet wird nur für Anzeige und
 * Eingabe. So bleiben Daten, Sync und Berechnungen unverändert, egal was eingestellt ist.
 */

const LBS_PER_KG = 2.20462
const CM_PER_IN = 2.54
const ML_PER_OZ = 29.5735

export type Kind = 'weight' | 'length' | 'volume'

function factor(kind: Kind, prefs: Prefs): number {
  if (kind === 'weight') return prefs.weightUnit === 'lbs' ? LBS_PER_KG : 1
  if (kind === 'length') return prefs.lengthUnit === 'in' ? 1 / CM_PER_IN : 1
  return prefs.volumeUnit === 'oz' ? 1 / ML_PER_OZ : 1
}

export function unitLabel(kind: Kind, prefs: Prefs = getPrefs()): string {
  if (kind === 'weight') return prefs.weightUnit
  if (kind === 'length') return prefs.lengthUnit
  return prefs.volumeUnit
}

/** Metrischer Wert → Anzeige-Einheit. */
export function toDisplay(value: number, kind: Kind, prefs: Prefs = getPrefs()): number {
  return value * factor(kind, prefs)
}

/** Anzeige-Einheit → metrisch (für Eingaben). */
export function fromDisplay(value: number, kind: Kind, prefs: Prefs = getPrefs()): number {
  return value / factor(kind, prefs)
}

/** Umgerechnet und gerundet, z.B. für Eingabefelder. */
export function displayValue(value: number | undefined, kind: Kind, decimals = 1, prefs: Prefs = getPrefs()): number | undefined {
  if (value === undefined) return undefined
  const f = 10 ** decimals
  return Math.round(toDisplay(value, kind, prefs) * f) / f
}

/** Fertiger Text mit Einheit, z.B. "82,5 kg" bzw. "181,9 lbs". */
export function formatUnit(value: number | undefined, kind: Kind, decimals = 1, prefs: Prefs = getPrefs()): string {
  if (value === undefined) return '–'
  const n = toDisplay(value, kind, prefs).toLocaleString('de-DE', { maximumFractionDigits: decimals })
  return `${n} ${unitLabel(kind, prefs)}`
}

/** Hook-Variante: rendert neu, wenn die Einheit umgestellt wird. */
export function useUnits() {
  const prefs = usePrefs()
  return {
    prefs,
    label: (kind: Kind) => unitLabel(kind, prefs),
    show: (value: number | undefined, kind: Kind, decimals = 1) => displayValue(value, kind, decimals, prefs),
    parse: (value: number | undefined, kind: Kind) => (value === undefined ? undefined : fromDisplay(value, kind, prefs)),
    format: (value: number | undefined, kind: Kind, decimals = 1) => formatUnit(value, kind, decimals, prefs),
  }
}
