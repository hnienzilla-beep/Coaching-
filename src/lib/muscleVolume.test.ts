import { describe, expect, it } from 'vitest'
import { heatLevel, setsPerGroup, volumeVerdict } from './muscleVolume'

describe('Muskel-Volumen', () => {
  it('zählt Sätze je Gruppe, Ganzkörper halb für alle', () => {
    const r = setsPerGroup(['Brust', 'Brust', 'Beine', 'Ganzkörper', 'Sonstiges'])
    expect(r.Brust).toBe(2.5)
    expect(r.Beine).toBe(1.5)
    expect(r.Bauch).toBe(0.5)
  })
  it('Stufen und Bewertung', () => {
    expect(heatLevel(0)).toBe(0)
    expect(heatLevel(6)).toBe(0.5)
    expect(heatLevel(30)).toBe(1)
    expect(volumeVerdict(0)).toBe('fehlt')
    expect(volumeVerdict(14)).toBe('Ziel ✓')
  })
})
