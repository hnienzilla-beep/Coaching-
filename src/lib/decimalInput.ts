/**
 * Zahlen-Eingabe für Dezimalfelder (Gewicht, KFA, Umfänge ...). Deutsche Tastaturen liefern
 * ein Komma, gespeichert wird aber immer eine JS-Zahl - deshalb liegen Anzeige-Text und Wert
 * auseinander, solange die Eingabe noch unvollständig ist ("80,", ",", "-").
 */

/** Erlaubt nur Ziffern mit höchstens einem Trennzeichen und optionalem Minus. */
export function isDecimalInput(raw: string): boolean {
  return /^-?\d*[.,]?\d*$/.test(raw)
}

/**
 * Wandelt den Rohtext in eine Zahl. Zwischenstände ohne Ziffer (",", "-", "-,") ergeben
 * bewusst `undefined` statt `NaN` - ein gespeichertes NaN würde sonst als Text "NaN" ins
 * Feld zurückgeschrieben und jede weitere Eingabe blockieren.
 */
export function parseDecimalInput(raw: string): number | undefined {
  const normalized = raw.replace(',', '.')
  if (!/\d/.test(normalized)) return undefined
  const value = Number(normalized)
  return Number.isFinite(value) ? value : undefined
}

/** Anzeige-Text für einen gespeicherten Wert; unbrauchbare Werte (NaN) werden geleert. */
export function formatDecimalInput(value: number | undefined): string {
  return value !== undefined && Number.isFinite(value) ? String(value) : ''
}
