import { describe, expect, it } from 'vitest'
import { buildWeekStory, storyHasContent } from './weekStory'
import type { DailyEntry } from '../models/types'

const e = (date: string, patch: Partial<DailyEntry>): DailyEntry => ({ id: date, athleteId: 'a', date, ...patch })

describe('buildWeekStory', () => {
  it('fasst Ernährung, Gewicht und Training der Woche zusammen', () => {
    const entries = [
      e('2026-09-15', { weightKg: 82 }),
      e('2026-09-16', { weightKg: 82.4 }),
      e('2026-09-21', { calories: 2200, protein: 170, weightKg: 81.6, waterMl: 3000 }),
      e('2026-09-22', { calories: 2600, protein: 150, weightKg: 81.4 }),
      e('2026-09-23', { calories: 2000, protein: 180 }),
    ]
    const workouts = [
      { date: '2026-09-22', sets: [{ done: true, reps: 5, weightKg: 100, exercise: 'Kniebeuge' }, { done: true, reps: 8, weightKg: 80, exercise: 'Bankdrücken' }] },
      { date: '2026-09-24', sets: [{ done: false, reps: 5, weightKg: 140, exercise: 'Kreuzheben' }] },
    ]
    const s = buildWeekStory('2026-09-21', entries, workouts, { kcal: 2200, tolerance: 100 })
    expect(s.end).toBe('2026-09-27')
    expect(s.loggedDays).toBe(3)
    expect(s.avgKcal).toBe(2266.6666666666665)
    expect(s.daysOnTarget).toBe(1)
    expect(s.weightDelta).toBe(-0.7)
    expect(s.trainings).toBe(1)
    expect(s.setsDone).toBe(2)
    expect(s.volumeKg).toBe(1140)
    expect(s.topSet).toEqual({ exercise: 'Kniebeuge', weightKg: 100, reps: 5 })
    expect(s.bestDay).toEqual({ date: '2026-09-21', kcal: 2200 })
    expect(storyHasContent(s)).toBe(true)
  })

  it('leere Woche hat keinen Inhalt', () => {
    expect(storyHasContent(buildWeekStory('2026-09-21', [], [], { kcal: 2000, tolerance: 100 }))).toBe(false)
  })
})
