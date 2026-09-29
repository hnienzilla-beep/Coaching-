import NutritionPage from './NutritionPage'
import NutritionLogPage from './NutritionLogPage'
import SupplementPlanPage from './SupplementPlanPage'
import { SubViewBar } from '../components/ui'
import TourHint from '../components/TourHint'
import { usePrefs } from '../lib/prefs'
import { swipeAnimationClass, useSubView } from '../lib/swipeNavigation'

// Das Log steht bewusst vorne und ist die Startansicht: Es ist die Ansicht, die im
// Alltag mehrmals täglich gebraucht wird, der Plan dagegen selten.
const VIEWS = [
  { key: 'log', label: 'Log' },
  { key: 'plan', label: 'Plan' },
  { key: 'supplements', label: 'Supplements' },
] as const

export default function ErnaehrungPage() {
  // Ausgeblendete Unteransichten (Einstellungen) fallen weg; mindestens eine bleibt immer.
  const prefs = usePrefs()
  const views = VIEWS.filter((v) => !prefs.hiddenSubViews.includes(`ernaehrung:${v.key}`))
  const shown = views.length ? views : VIEWS
  // Die Ansicht steht in der Adresse (`?view=plan`): So öffnet der Reiter wieder die zuletzt
  // genutzte Ansicht, und "Log als Plan speichern" springt gezielt in den Plan.
  const { view, direction, select } = useSubView('ernaehrung', shown)

  return (
    <div className="flex flex-col gap-4">
      {/* Die Leiste zuerst - sie klebt oben und greift dafür in den Innenabstand. */}
      {shown.length > 1 && <SubViewBar options={shown} value={view} onChange={select} />}
      <TourHint id="ernaehrung" />
      {/* Nur beim Umschalten in der Leiste gleitet der Inhalt - beim Reiterwechsel bewegt
          sich schon die ganze Seite. */}
      <div key={view} className={direction ? swipeAnimationClass(direction) : ''}>
        {view === 'plan' && <NutritionPage />}
        {view === 'log' && <NutritionLogPage />}
        {view === 'supplements' && <SupplementPlanPage />}
      </div>
    </div>
  )
}
