/**
 * Merkt sich, welcher Athlet zuletzt offen war, damit die App beim nächsten Start
 * wieder dort landet statt in einer Übersicht.
 *
 * Bewusst schlicht gehalten (kein Store mit Abo wie in `detailLevel.ts`): Der Wert wird
 * genau einmal beim Start gelesen und danach nur noch geschrieben - auf eine Änderung
 * muss keine gemountete Komponente reagieren.
 */

const STORAGE_KEY = 'lastAthleteId'

export function getLastAthleteId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    // Private Mode - dann startet die App eben beim ersten Athleten.
    return null
  }
}

export function setLastAthleteId(athleteId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, athleteId)
  } catch {
    // Siehe oben.
  }
}

export function clearLastAthleteId(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Siehe oben.
  }
}
