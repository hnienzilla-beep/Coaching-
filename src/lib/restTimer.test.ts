import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Der Pausen-Timer hält seinen Zustand im Modul und in localStorage. Beides muss für jeden
 * Test frisch sein - deshalb wird das Modul pro Test neu geladen (`vi.resetModules`) und
 * localStorage vorher gesetzt.
 */

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
  // Node stellt `navigator` erst ab Version 21 global bereit, die CI läuft auf 20. Der
  // Standard hier ist deshalb "kein navigator" - so faellt auf, wenn der Zugriff im Modul
  // nicht abgesichert ist, egal mit welchem Node der Test laeuft.
  vi.stubGlobal('navigator', undefined)
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-03T18:00:00Z'))
  vi.resetModules()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function loadTimer() {
  return await import('./restTimer')
}

function persisted(): { duration: number; endTime: number | null } {
  return JSON.parse(store.get('rest-timer') ?? '{}')
}

describe('restTimer', () => {
  it('merkt sich die laufende Pause in localStorage', async () => {
    const { startRestTimer, getRestTimer } = await loadTimer()

    startRestTimer(60)

    expect(getRestTimer().remaining).toBe(60)
    expect(persisted().endTime).toBe(Date.now() + 60_000)
    expect(persisted().duration).toBe(60)
  })

  it('zählt herunter, ohne mitzuzählen - die Restzeit kommt aus der Endzeit', async () => {
    const { startRestTimer, getRestTimer } = await loadTimer()

    startRestTimer(90)
    vi.advanceTimersByTime(30_000)

    expect(getRestTimer().remaining).toBe(60)
  })

  it('beendet die Pause und hinterlässt den Hinweis', async () => {
    const { startRestTimer, getRestTimer } = await loadTimer()

    startRestTimer(30)
    vi.advanceTimersByTime(31_000)

    const state = getRestTimer()
    expect(state.endTime).toBeNull()
    expect(state.remaining).toBe(0)
    expect(state.finishedAt).not.toBeNull()
  })

  it('stellt eine noch laufende Pause nach dem Neuladen wieder her', async () => {
    store.set('rest-timer', JSON.stringify({ duration: 120, endTime: Date.now() + 45_000 }))

    const { getRestTimer, startRestTimerRuntime } = await loadTimer()
    startRestTimerRuntime()

    expect(getRestTimer().endTime).not.toBeNull()
    expect(getRestTimer().remaining).toBe(45)
    expect(getRestTimer().duration).toBe(120)
  })

  it('rechnet eine abgelaufene Pause nicht ins Minus', async () => {
    store.set('rest-timer', JSON.stringify({ duration: 90, endTime: Date.now() - 30_000 }))

    const { getRestTimer, startRestTimerRuntime } = await loadTimer()
    startRestTimerRuntime()

    expect(getRestTimer().remaining).toBe(0)
    expect(getRestTimer().endTime).toBeNull()
  })

  it('meldet eine lange zurückliegende Pause nicht mehr', async () => {
    // App lag über Nacht geschlossen - beim Öffnen darf kein Hinweis mehr aufpoppen.
    store.set('rest-timer', JSON.stringify({ duration: 90, endTime: Date.now() - 8 * 60 * 60_000 }))

    const { getRestTimer, startRestTimerRuntime } = await loadTimer()
    startRestTimerRuntime()

    expect(getRestTimer().endTime).toBeNull()
    expect(getRestTimer().finishedAt).toBeNull()
  })

  it('vibriert am Pausenende, wo das Geraet es kann', async () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    const { startRestTimer } = await loadTimer()

    startRestTimer(30)
    vi.advanceTimersByTime(31_000)

    expect(vibrate).toHaveBeenCalledOnce()
  })

  it('kommt ohne navigator aus', async () => {
    // Kein globales navigator (Node 20, alte Umgebungen) - das Pausenende darf trotzdem
    // nicht werfen, sonst bleibt der Timer im Zustand "laeuft noch" haengen.
    const { startRestTimer, getRestTimer } = await loadTimer()

    startRestTimer(30)
    expect(() => vi.advanceTimersByTime(31_000)).not.toThrow()
    expect(getRestTimer().endTime).toBeNull()
  })

  it('bricht die Pause ab, ohne den Hinweis zu zeigen', async () => {
    const { startRestTimer, cancelRestTimer, getRestTimer } = await loadTimer()

    startRestTimer(60)
    vi.advanceTimersByTime(10_000)
    cancelRestTimer()

    expect(getRestTimer().endTime).toBeNull()
    expect(getRestTimer().finishedAt).toBeNull()
    expect(persisted().endTime).toBeNull()
  })

  it('benachrichtigt Abonnenten bei jedem Sekundenwechsel', async () => {
    const { startRestTimer, subscribeRestTimer } = await loadTimer()
    const listener = vi.fn()
    subscribeRestTimer(listener)

    startRestTimer(60)
    listener.mockClear()
    // Vier Takte à 250 ms, aber nur ein Sekundenwechsel - sonst würde die Oberfläche
    // viermal pro Sekunde neu rendern.
    vi.advanceTimersByTime(1_000)

    expect(listener).toHaveBeenCalledTimes(1)
  })
})
