import TrainingPlanPage from './TrainingPlanPage'
import WorkoutLogPage from './WorkoutLogPage'
import { SubViewBar } from '../components/ui'
import TourHint from '../components/TourHint'
import { usePrefs } from '../lib/prefs'
import { swipeAnimationClass, useSubView } from '../lib/swipeNavigation'

// Das Log steht bewusst vorne und ist die Startansicht: Es ist die Ansicht, die beim
// Training selbst gebraucht wird, der Plan dagegen selten.
const VIEWS = [
  { key: 'log', label: 'Log' },
  { key: 'plan', label: 'Plan' },
] as const

export default function TrainingPage() {
  // Ausgeblendete Unteransichten (Einstellungen) fallen weg; mindestens eine bleibt immer.
  const prefs = usePrefs()
  const views = VIEWS.filter((v) => !prefs.hiddenSubViews.includes(`training:${v.key}`))
  const shown = views.length ? views : VIEWS
  // Ansicht in der Adresse (`?view=plan`) - siehe ErnaehrungPage.
  const { view, direction, select } = useSubView('training', shown)

  return (
    <div className="flex flex-col gap-4">
      {/* Die Leiste zuerst - sie klebt oben und greift dafür in den Innenabstand. */}
      {shown.length > 1 && <SubViewBar options={shown} value={view} onChange={select} />}
      <TourHint id="training" />
      {/* Nur beim Umschalten in der Leiste gleitet der Inhalt - beim Reiterwechsel bewegt
          sich schon die ganze Seite. */}
      <div key={view} className={direction ? swipeAnimationClass(direction) : ''}>
        {view === 'plan' && <TrainingPlanPage />}
        {view === 'log' && <WorkoutLogPage />}
      </div>
    </div>
  )
}
