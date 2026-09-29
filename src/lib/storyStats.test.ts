import { describe, expect, it } from 'vitest'
import { buildPeriodStats, periodHasContent, type StoryInput } from './storyStats'
import type { DailyEntry } from '../models/types'

const e = (date: string, patch: Partial<DailyEntry>): DailyEntry => ({ id: date, athleteId: 'a', date, ...patch })

const base: Omit<StoryInput, 'entries' | 'sets' | 'workouts' | 'foods'> = {
  kind: 'week',
  start: '2026-09-21',
  end: '2026-09-27',
  target: { kcal: 2200, protein: 180, tolerance: 100, waterMl: 3000 },
  goal: { targetWeightKg: 78, losing: true },
}

describe('buildPeriodStats', () => {
  const input: StoryInput = {
    ...base,
    entries: [
      e('2026-09-14', { weightKg: 82, calories: 2100 }),
      e('2026-09-16', { weightKg: 82.4, calories: 2100 }),
      e('2026-09-21', { calories: 2200, protein: 170, weightKg: 81.6, waterMl: 3000, waist: 88 }),
      e('2026-09-22', { calories: 2250, protein: 150, weightKg: 81.4 }),
      e('2026-09-26', { calories: 2900, protein: 150 }),
      e('2026-09-27', { calories: 2800, protein: 140, waist: 87 }),
    ],
    sets: [
      { date: '2026-09-10', done: true, reps: 5, weightKg: 95, exercise: 'Kniebeuge', muscle: 'Quadrizeps' },
      { date: '2026-09-22', done: true, reps: 5, weightKg: 100, exercise: 'Kniebeuge', muscle: 'Quadrizeps' },
      { date: '2026-09-10', done: true, reps: 6, weightKg: 80, exercise: 'Bankdrücken', muscle: 'Brust' },
      { date: '2026-09-22', done: true, reps: 8, weightKg: 80, exercise: 'Bankdrücken', muscle: 'Brust' },
      { date: '2026-09-24', done: false, reps: 5, weightKg: 140, exercise: 'Kreuzheben', muscle: 'Unterer Rücken' },
    ],
    workouts: [
      { date: '2026-09-22', durationMin: 62 },
      { date: '2026-09-24', durationMin: 20 },
    ],
    foods: [
      { date: '2026-09-21', name: 'Skyr', grams: 250 },
      { date: '2026-09-22', name: 'Skyr', grams: 250 },
      { date: '2026-09-22', name: 'Reis', grams: 150 },
      { date: '2026-09-23', name: 'Haferflocken', grams: 80 },
      { date: '2026-09-24', name: 'Haferflocken', grams: 80 },
      { date: '2026-09-25', name: 'Haferflocken', grams: 80 },
      { date: '2026-09-10', name: 'Pizza', grams: 400 },
    ],
  }
  const s = buildPeriodStats(input)

  it('Ernährung und Serien', () => {
    expect(s.days).toHaveLength(7)
    expect(s.loggedDays).toBe(4)
    expect(s.daysOnTarget).toBe(2)
    expect(s.weekendExtraKcal).toBeGreaterThan(600)
    expect(s.streak).toBe(2)
    expect(s.bestStreak).toBe(2)
    // Nach Menge sortiert: Skyr (500 g) vor Haferflocken (240 g, obwohl öfter gegessen).
    expect(s.topFoods[0]).toEqual({ name: 'Skyr', count: 2, grams: 500 })
    expect(s.topFoods.map((f) => f.name)).toEqual(['Skyr', 'Haferflocken', 'Reis'])
    expect(s.topFoods.map((f) => f.name)).not.toContain('Pizza')
  })

  it('Gewicht, Training, Rekorde, Maße', () => {
    expect(s.weightDelta).toBe(-0.7)
    expect(s.trainings).toBe(1)
    expect(s.setsDone).toBe(2)
    expect(s.durationMin).toBe(82)
    expect(s.longestMin).toBe(62)
    // Rekorde nach geschätztem 1RM - auch mehr Wiederholungen bei gleichem Gewicht zählen.
    expect(s.prs).toEqual([
      { exercise: 'Bankdrücken', weightKg: 80, reps: 8, oneRm: 101.3, previousOneRm: 96 },
      { exercise: 'Kniebeuge', weightKg: 100, reps: 5, oneRm: 116.7, previousOneRm: 110.8 },
    ])
    expect(s.measures).toEqual([{ label: 'Bauch', latest: 87, delta: -1 }])
    expect(s.missingMuscles).toContain('Latissimus')
  })

  it('Coach-Tipps, höchstens drei', () => {
    expect(s.tips.length).toBeGreaterThan(0)
    expect(s.tips.length).toBeLessThanOrEqual(3)
    expect(s.tips.join(' ')).toMatch(/Tagen erfasst|Protein|Wochenende/)
    expect(periodHasContent(s)).toBe(true)
  })

  it('leerer Zeitraum hat keinen Inhalt', () => {
    expect(periodHasContent(buildPeriodStats({ ...base, entries: [], sets: [], workouts: [], foods: [] }))).toBe(false)
  })
})
