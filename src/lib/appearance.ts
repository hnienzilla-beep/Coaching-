import { getPrefs, subscribePrefs, type Prefs } from './prefs'

/*
 * Darstellung aus den Einstellungen als Klassen am <html>: Schriftgröße, Kontrast und
 * Animationen. Das CSS (index.css) hängt daran - so wirkt eine Änderung sofort überall.
 */
function apply(prefs: Prefs): void {
  const root = document.documentElement
  root.classList.toggle('font-small', prefs.fontSize === 's')
  root.classList.toggle('font-large', prefs.fontSize === 'l')
  root.classList.toggle('contrast-high', prefs.contrast === 'high')
  root.classList.toggle('motion-reduced', prefs.animations === 'reduced')
  root.classList.toggle('motion-off', prefs.animations === 'off')
  // Transparenz der Flächen: Die Deckkraft geht als Variable ins CSS (index.css, .surface-alpha).
  const t = prefs.surfaceTransparency
  const set = typeof t === 'number'
  root.classList.toggle('surface-alpha', set)
  if (set) root.style.setProperty('--surface-alpha', String((100 - Math.max(0, Math.min(95, t))) / 100))
  else root.style.removeProperty('--surface-alpha')
}

export function startAppearance(): void {
  apply(getPrefs())
  subscribePrefs(() => apply(getPrefs()))
}
