import { describe, expect, it } from 'vitest'
import { formatDecimalInput, isDecimalInput, parseDecimalInput } from './decimalInput'

describe('isDecimalInput', () => {
  it('erlaubt Zwischenstände beim Tippen', () => {
    for (const raw of ['', '-', ',', '.', '8', '80,', '80,5', '80.5', '-3,2']) {
      expect(isDecimalInput(raw), raw).toBe(true)
    }
  })

  it('lehnt Buchstaben und ein zweites Trennzeichen ab', () => {
    for (const raw of ['NaN', '80kg', '80,,5', '80,5,1']) {
      expect(isDecimalInput(raw), raw).toBe(false)
    }
  })
})

describe('parseDecimalInput', () => {
  it('liest Komma und Punkt gleich', () => {
    expect(parseDecimalInput('80,5')).toBe(80.5)
    expect(parseDecimalInput('80.5')).toBe(80.5)
    expect(parseDecimalInput('-3,25')).toBe(-3.25)
  })

  it('gibt für Zwischenstände ohne Ziffer undefined statt NaN', () => {
    for (const raw of ['', '-', ',', '.', '-,']) {
      expect(parseDecimalInput(raw), raw).toBeUndefined()
    }
  })

  it('behält angefangene Nachkommastellen als Zahl', () => {
    expect(parseDecimalInput('80,')).toBe(80)
    expect(parseDecimalInput(',5')).toBe(0.5)
  })
})

describe('formatDecimalInput', () => {
  it('zeigt Zahlen an und leert unbrauchbare Werte', () => {
    expect(formatDecimalInput(80.5)).toBe('80.5')
    expect(formatDecimalInput(undefined)).toBe('')
    expect(formatDecimalInput(NaN)).toBe('')
  })
})
