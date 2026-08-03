/**
 * Pausen-Timer als App-weiter Zustand.
 *
 * Bewusst kein React-State: Der Timer sitzt im Trainingslog, und dessen Seite wird beim
 * Wechsel auf einen anderen Reiter ausgehängt (`TrainingPage` rendert die Unterseiten
 * bedingt). Läge die Endzeit in `useState`, wäre die laufende Pause damit weg. Hier liegt
 * sie stattdessen im Modul und zusätzlich in `localStorage` - so übersteht sie
 * Seitenwechsel, Neuladen und einen App-Neustart.
 *
 * Gerechnet wird immer aus der absoluten Endzeit gegen `Date.now()`, nie durch Herunterzählen.
 * Der Takt darf also gedrosselt werden oder ganz ausfallen, ohne dass die Restzeit falsch wird.
 *
 * Grenze der Plattform: Eine PWA kann auf iOS im Hintergrund keinen Code ausführen. Läuft die
 * Pause ab, während die App minimiert oder das Display aus ist, kommt das Signal nicht
 * pünktlich - es wird beim Zurückkehren nachgeholt (siehe `CATCH_UP_MS`).
 *
 * Aufbau nach dem Vorbild von `src/features/obsidianSync/syncState.ts`: Modul-Zustand,
 * Listener-Set für `useSyncExternalStore`, Spiegelung nach localStorage mit try/catch.
 */

export interface RestTimerState {
  /** Gewählte Pausenlänge in Sekunden (bleibt über Pausen hinweg erhalten). */
  duration: number
  /** Zeitstempel des Pausenendes, `null` wenn gerade keine Pause läuft. */
  endTime: number | null
  /** Verbleibende Sekunden, `0` wenn keine Pause läuft. */
  remaining: number
  /** Zeitpunkt, an dem die letzte Pause abgelaufen ist - für den Hinweis "Pause vorbei". */
  finishedAt: number | null
}

export const REST_DURATIONS = [30, 45, 60, 90, 120, 150, 180]

const DEFAULT_DURATION = 90
const STORAGE_KEY = 'rest-timer'
/** Takt der Anzeige. Feiner als eine Sekunde, damit der Sekundenwechsel nicht nachhinkt. */
const TICK_MS = 250
/** So lange bleibt der Hinweis "Pause vorbei" stehen. */
const HINT_MS = 15_000
/**
 * Wie lange ein verpasstes Pausenende noch nachgeholt wird. Wer die App am nächsten Morgen
 * öffnet, soll nicht vom Piepser der letzten Trainingspause begrüßt werden.
 */
const CATCH_UP_MS = 2 * 60_000

interface PersistedState {
  duration: number
  endTime: number | null
}

const EMPTY: PersistedState = { duration: DEFAULT_DURATION, endTime: null }

function readStorage(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return {
      duration: typeof parsed.duration === 'number' && parsed.duration > 0 ? parsed.duration : DEFAULT_DURATION,
      endTime: typeof parsed.endTime === 'number' ? parsed.endTime : null,
    }
  } catch {
    return EMPTY
  }
}

function writeStorage(persisted: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
  } catch {
    // Speicher voll oder Private Mode - der Zustand im Modul reicht für diese Sitzung.
  }
}

function remainingFor(endTime: number | null): number {
  if (endTime === null) return 0
  return Math.max(0, Math.ceil((endTime - Date.now()) / 1000))
}

const restored = readStorage()
let state: RestTimerState = {
  duration: restored.duration,
  endTime: restored.endTime,
  remaining: remainingFor(restored.endTime),
  finishedAt: null,
}

const listeners = new Set<() => void>()

export function getRestTimer(): RestTimerState {
  return state
}

/** Abo für React (useSyncExternalStore). */
export function subscribeRestTimer(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function setState(patch: Partial<RestTimerState>): void {
  const next = { ...state, ...patch }
  if (
    next.duration === state.duration &&
    next.endTime === state.endTime &&
    next.remaining === state.remaining &&
    next.finishedAt === state.finishedAt
  ) {
    return
  }
  state = next
  writeStorage({ duration: state.duration, endTime: state.endTime })
  listeners.forEach((l) => l())
}

// --- Signal (Ton + Vibration) --------------------------------------------------------

// Auf Modulebene statt in der Komponente: Nach einem Seitenwechsel gäbe es die Komponente
// nicht mehr, und ein erst dann erzeugter AudioContext bliebe auf iOS stumm - entsperrt wird
// er nur in einer Nutzergeste (siehe `startRestTimer`).
let audioCtx: AudioContext | null = null
/** Pausenende, das noch signalisiert werden muss (App war zu dem Zeitpunkt im Hintergrund). */
let pendingSignalAt: number | null = null

function unlockAudio(): void {
  try {
    audioCtx ??= new AudioContext()
    void audioCtx.resume()
  } catch {
    // Kein WebAudio (alter Browser, blockierte Ausgabe) - dann eben nur Vibration.
  }
}

function playSignal(): void {
  if (audioCtx) {
    try {
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start()
      osc.stop(audioCtx.currentTime + 0.6)
    } catch {
      // Ausgabe nicht verfügbar - die Vibration unten bleibt.
    }
  }
  navigator.vibrate?.([200, 100, 200])
}

/**
 * Beendet die Pause: Hinweis setzen und signalisieren. Ist die App gerade nicht sichtbar,
 * wird das Signal vorgemerkt und beim Zurückkehren nachgeholt. Liegt das Ende schon länger
 * als `CATCH_UP_MS` zurück (die App lag über Nacht geschlossen), passiert gar nichts mehr -
 * niemand will morgens vom Piepser der gestrigen Trainingspause begrüßt werden.
 */
function finishTimer(endTime: number): void {
  const stale = Date.now() - endTime > CATCH_UP_MS
  setState({ endTime: null, remaining: 0, finishedAt: stale ? null : endTime })
  if (stale) return
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    pendingSignalAt = endTime
    return
  }
  playSignal()
}

// --- Takt ----------------------------------------------------------------------------

let ticker: ReturnType<typeof setInterval> | null = null

function stopTicker(): void {
  if (ticker === null) return
  clearInterval(ticker)
  ticker = null
}

function ensureTicker(): void {
  if (ticker !== null) return
  ticker = setInterval(tick, TICK_MS)
}

function tick(): void {
  const now = Date.now()

  if (state.endTime !== null) {
    const remaining = remainingFor(state.endTime)
    if (remaining > 0) {
      setState({ remaining })
      return
    }
    finishTimer(state.endTime)
    return
  }

  // Keine Pause mehr, nur noch der Hinweis - der läuft nach HINT_MS aus.
  if (state.finishedAt !== null && now - state.finishedAt >= HINT_MS) {
    setState({ finishedAt: null })
  }
  if (state.finishedAt === null) stopTicker()
}

// --- Öffentliche Aktionen -------------------------------------------------------------

export function setRestDuration(seconds: number): void {
  setState({ duration: seconds })
}

export function startRestTimer(seconds: number = state.duration): void {
  // Muss in der Nutzergeste passieren, sonst bleibt der Ton auf iOS aus.
  unlockAudio()
  pendingSignalAt = null
  setState({ duration: seconds, endTime: Date.now() + seconds * 1000, remaining: seconds, finishedAt: null })
  ensureTicker()
}

export function cancelRestTimer(): void {
  pendingSignalAt = null
  setState({ endTime: null, remaining: 0, finishedAt: null })
  stopTicker()
}

/**
 * Holt die Anzeige sofort nach - nach dem Zurückkehren aus dem Hintergrund, wo der Takt
 * gedrosselt war oder ganz stand. Holt außerdem ein verpasstes Signal nach.
 */
export function refreshRestTimer(): void {
  if (state.endTime !== null) {
    ensureTicker()
    tick()
  }
  if (pendingSignalAt !== null && Date.now() - pendingSignalAt <= CATCH_UP_MS) {
    pendingSignalAt = null
    playSignal()
  } else {
    pendingSignalAt = null
  }
}

let runtimeStarted = false

/**
 * Startet den Takt und hängt sich an den Sichtbarkeitswechsel (idempotent - der
 * StrictMode-Doppelaufruf in der Entwicklung ist unschädlich).
 */
export function startRestTimerRuntime(): void {
  if (runtimeStarted) return
  runtimeStarted = true

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshRestTimer()
    })
  }
  refreshRestTimer()
  if (state.endTime !== null) ensureTicker()
}
