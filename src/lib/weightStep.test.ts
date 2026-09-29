import { describe, expect, it } from 'vitest'
import { learnedStep, smartWeightStep, stepFromName } from './weightStep'

describe('weightStep', () => {
  it('rät aus dem Namen', () => {
    expect(stepFromName('Schulterdrücken (Kurzhantel)')).toBe(2)
    expect(stepFromName('Latzug')).toBe(5)
    expect(stepFromName('Bankdrücken')).toBe(2.5)
  })
  it('lernt aus dem Verlauf', () => {
    expect(learnedStep([20, 22, 24, 26, 24])).toBe(2)
    expect(learnedStep([40, 45, 50, 45])).toBe(5)
    expect(learnedStep([80, 82.5])).toBeUndefined()
  })
  it('eigene Einstellung gewinnt', () => {
    expect(smartWeightStep('Latzug', [40, 45, 50], 1.25)).toEqual({ step: 1.25, source: 'eigen' })
    expect(smartWeightStep('Latzug', [40, 45, 50]).source).toBe('gelernt')
    expect(smartWeightStep('Latzug', [])).toEqual({ step: 5, source: 'automatisch' })
  })
})
