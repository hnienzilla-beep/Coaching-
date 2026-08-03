import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDays, todayIso } from './queries'

afterEach(() => {
  vi.useRealTimers()
})

// Die Zeitzone des Testlaufs ist nicht festgelegt, deshalb werden die Zeitpunkte aus
// lokalen Bestandteilen gebaut (`new Date(jahr, monat, ...)`) statt aus einem ISO-String
// mit festem Offset. Geprüft wird beide Male der Rand des Tages: östlich von Greenwich
// liegt 00:30 Ortszeit in UTC noch im Vortag, westlich davon 23:30 Ortszeit schon im
// Folgetag - genau die Fälle, in denen ein UTC-Datum den falschen Tag liefert.
describe('todayIso', () => {
  it('liefert kurz nach Mitternacht den angebrochenen Tag', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 3, 0, 30))

    expect(todayIso()).toBe('2026-08-03')
  })

  it('liefert kurz vor Mitternacht noch den laufenden Tag', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 3, 23, 30))

    expect(todayIso()).toBe('2026-08-03')
  })

  it('füllt Monat und Tag zweistellig auf', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 5, 12, 0))

    expect(todayIso()).toBe('2026-01-05')
  })
})

describe('addDays', () => {
  it('rechnet über den Sommerzeitwechsel hinweg tagesgenau', () => {
    // Umstellung auf Sommerzeit in Deutschland: 29.03.2026.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
    expect(addDays('2026-03-30', -2)).toBe('2026-03-28')
  })

  it('rechnet über Monats- und Jahresgrenzen', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})
