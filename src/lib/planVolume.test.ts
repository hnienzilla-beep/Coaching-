import { describe, expect, it } from 'vitest'
import { exerciseShares, pauseWarnings, planFrequencies, planVolume, volumeStatus, zoneRange } from './planVolume'
import type { TrainingPlan, TrainingPlanExercise } from '../models/types'

const plan = (id: string, order: number, timesPerWeek?: number): TrainingPlan => ({ id, athleteId: 'a', phaseName: id, order, timesPerWeek })
const row = (planId: string, exerciseId: string, sets: number): TrainingPlanExercise => ({ id: `${planId}-${exerciseId}`, planId, exerciseId, order: 0, sets, reps: '8-12' })

describe('Wochenvolumen im Plan', () => {
  it('Anteile: Katalog, eigene Angaben, Name', () => {
    expect(exerciseShares({ name: 'Bankdrücken', muscleGroup: 'Brust' }).get('Trizeps')).toBe(0.5)
    expect(exerciseShares({ name: 'Rumänisches Kreuzheben', muscleGroup: 'Beine' }).get('Po')).toBe(1)
    const own = exerciseShares({ name: 'Meine Übung', muscleGroup: 'Sonstiges', primaryMuscle: 'Brust', secondaryMuscles: ['Trizeps'] })
    expect(own.get('Brust')).toBe(1)
    expect(own.get('Trizeps')).toBe(0.5)
  })
  it('Häufigkeit aus festen Tagen, Rhythmus und eigener Angabe', () => {
    const plans = [plan('Push', 0), plan('Pull', 1)]
    expect([...planFrequencies({ trainingDays: [0, 1, 3, 4] }, plans).values()]).toEqual([2, 2])
    expect([...planFrequencies({ trainingDays: [0, 2, 4] }, plans).values()]).toEqual([2, 1])
    expect(planFrequencies({ schedule: { mode: 'rotation', on: 1, off: 1, start: '2026-01-01' } }, plans).get('Push')).toBe(1.75)
    expect(planFrequencies({ trainingDays: [0, 2, 4] }, [plan('Push', 0, 3), plan('Pull', 1)]).get('Push')).toBe(3)
  })
  it('Summe je Muskel und Status gegen Zone', () => {
    const plans = [plan('Push', 0), plan('Pull', 1)]
    const ex = new Map([
      ['b', { name: 'Bankdrücken', muscleGroup: 'Brust' as const }],
      ['l', { name: 'Latzug', muscleGroup: 'Rücken' as const }],
    ])
    const v = planVolume(plans, [row('Push', 'b', 4), row('Pull', 'l', 4)], ex, new Map([['Push', 2], ['Pull', 2]]))
    expect(v.weekly.get('Brust')).toBe(8)
    expect(v.weekly.get('Rücken')).toBe(8)
    expect(zoneRange('Brust', 'MAV')).toEqual({ lo: 12, hi: 20 })
    expect(volumeStatus('Brust', 8, 'MAV')).toBe('unter')
    expect(volumeStatus('Brust', 14, 'MAV')).toBe('ok')
    expect(volumeStatus('Brust', 30, 'MAV')).toBe('zuviel')
  })
  it('Pausen-Warnung bei gleichen Muskeln an Folgetagen', () => {
    const plans = [plan('A', 0), plan('B', 1)]
    const perPlan = new Map([
      ['A', new Map([['Brust' as const, 8]])],
      ['B', new Map([['Brust' as const, 8]])],
    ])
    expect(pauseWarnings({ trainingDays: [0, 1] }, plans, perPlan).length).toBeGreaterThan(0)
    expect(pauseWarnings({ trainingDays: [0, 3] }, plans, perPlan)).toEqual([])
  })
})
