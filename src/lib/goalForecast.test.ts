import { describe, expect, it } from 'vitest'
import { addDays } from '../db/queries'
import { forecastGoal } from './goalForecast'

const today = '2026-09-29'
const series = (start: number, perDay: number, days = 21) =>
  Array.from({ length: days }, (_, i) => ({ date: addDays(today, i - days + 1), weightKg: start + perDay * i }))

describe('forecastGoal', () => {
  it('berechnet das Zieldatum beim Abnehmen', () => {
    const f = forecastGoal(series(85, -0.1), 80, today)
    expect(f.kind).toBe('eta')
    if (f.kind === 'eta') {
      expect(f.current).toBe(83)
      expect(f.perWeek).toBeCloseTo(-0.7)
      expect(f.days).toBe(30)
      expect(f.date).toBe(addDays(today, 30))
    }
  })
  it('meldet, wenn der Trend vom Ziel wegläuft', () => {
    expect(forecastGoal(series(80, 0.05), 75, today).kind).toBe('away')
  })
  it('braucht genug Daten', () => {
    expect(forecastGoal(series(80, -0.1, 3), 75, today).kind).toBe('insufficient')
  })
  it('erkennt ein erreichtes Ziel', () => {
    expect(forecastGoal(series(80.1, 0), 80, today).kind).toBe('reached')
  })
})
