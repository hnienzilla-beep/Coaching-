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
}

export function startAppearance(): void {
  apply(getPrefs())
  subscribePrefs(() => apply(getPrefs()))
}
