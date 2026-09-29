import { describe, expect, it } from 'vitest'
import { EXERCISE_SEED } from '../data/exerciseSeed'
import { muscleHeat, primaryMuscle, todaysFocus } from './muscles'

const m = (name: string) => primaryMuscle({ name, muscleGroup: EXERCISE_SEED.find((e) => e.name === name)?.muscleGroup ?? 'Sonstiges' })

describe('primaryMuscle', () => {
  it('ordnet die Standard-Übungen sinnvoll zu', () => {
    expect(m('Bankdrücken')).toBe('Brust')
    expect(m('Enges Bankdrücken')).toBe('Trizeps')
    expect(m('Dips')).toBe('Brust')
    expect(m('Kreuzheben')).toBe('Unterer Rücken')
    expect(m('Klimmzüge')).toBe('Latissimus')
    expect(m('Langhantelrudern')).toBe('Latissimus')
    expect(m('Kniebeuge')).toBe('Quadrizeps')
    expect(m('Beinbeuger')).toBe('Beinbeuger')
    expect(m('Wadenheben (stehend)')).toBe('Waden')
    expect(m('Hip Thrust')).toBe('Po')
    expect(m('Seitheben')).toBe('Seitliche Schulter')
    expect(m('Schulterdrücken (Kurzhantel)')).toBe('Vordere Schulter')
    expect(m('Reverse Butterfly')).toBe('Hintere Schulter')
    expect(m('Face Pulls')).toBe('Hintere Schulter')
    expect(m('Hammercurls')).toBe('Bizeps')
    expect(m('French Press')).toBe('Trizeps')
    expect(m('Russian Twist')).toBe('Seitlicher Bauch')
    expect(m('Beinheben (hängend)')).toBe('Bauch')
    expect(m('Burpees')).toBeUndefined()
  })
  it('eigene Einstellung gewinnt', () => {
    expect(primaryMuscle({ name: 'Dips', muscleGroup: 'Brust', primaryMuscle: 'Trizeps' })).toBe('Trizeps')
  })
  it('jede Standard-Übung außer Ganzkörper und Cardio hat einen Muskel', () => {
    // Cardio (Sonstiges) trainiert keinen einzelnen Muskel.
    for (const e of EXERCISE_SEED) if (e.muscleGroup !== 'Ganzkörper' && e.muscleGroup !== 'Sonstiges') expect(m(e.name), e.name).toBeDefined()
  })
})

describe('muscleHeat / todaysFocus', () => {
  it('Stufe und Glühen', () => {
    expect(muscleHeat(6, 12)).toEqual({ level: 0.5, glow: false })
    expect(muscleHeat(14, 12)).toEqual({ level: 1, glow: true })
  })
  it('schlägt untertrainierte, erholte Muskeln vor', () => {
    const today = '2026-09-29'
    const recs = [
      ...Array.from({ length: 12 }, () => ({ muscle: 'Brust' as const, date: '2026-09-27', exercise: 'Bank' })),
      ...Array.from({ length: 3 }, () => ({ muscle: 'Quadrizeps' as const, date: '2026-09-28', exercise: 'Squat' })),
    ]
    const focus = todaysFocus(recs, today)
    expect(focus).not.toContain('Brust')
    expect(focus).not.toContain('Quadrizeps') // gestern trainiert
    expect(focus.length).toBe(3)
  })
})
