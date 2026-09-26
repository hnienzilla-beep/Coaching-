import { describe, expect, it } from 'vitest'
import { hexToHsv, hsvToHex, pointToHueSat } from './colorWheel'

describe('Farbkugel', () => {
  it('rechnet HSV und Hex hin und zurück', () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#ff0000')
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe('#00ff00')
    expect(hsvToHex({ h: 0, s: 0, v: 1 })).toBe('#ffffff')
    const hsv = hexToHsv('#22d3ee')
    expect(hsvToHex(hsv)).toBe('#22d3ee')
  })

  it('oben ist Rot, rechts Gelbgrün (90°), Mitte ungesättigt', () => {
    expect(pointToHueSat(0, -1)).toEqual({ h: 0, s: 1 })
    expect(pointToHueSat(1, 0).h).toBeCloseTo(90)
    expect(pointToHueSat(0, 0).s).toBe(0)
    expect(pointToHueSat(3, 0).s).toBe(1)
  })
})
