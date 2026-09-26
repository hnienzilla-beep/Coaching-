import TrainingPlanPage from './TrainingPlanPage'
import WorkoutLogPage from './WorkoutLogPage'
import { SubViewBar } from '../components/ui'
import { swipeAnimationClass, useSubView } from '../lib/swipeNavigation'

// Das Log steht bewusst vorne und ist die Startansicht: Es ist die Ansicht, die beim
// Training selbst gebraucht wird, der Plan dagegen selten.
const VIEWS = [
  { key: 'log', label: 'Log' },
  { key: 'plan', label: 'Plan' },
] as const

export default function TrainingPage() {
  // Ansicht in der Adresse (`?view=plan`) - siehe ErnaehrungPage.
  const { view, direction, select } = useSubView('training', VIEWS)

  return (
    <div className="flex flex-col gap-4">
      <SubViewBar options={VIEWS} value={view} onChange={select} />
      {/* Nur beim Umschalten in der Leiste gleitet der Inhalt - beim Reiterwechsel bewegt
          sich schon die ganze Seite. */}
      <div key={view} className={direction ? swipeAnimationClass(direction) : ''}>
        {view === 'plan' && <TrainingPlanPage />}
        {view === 'log' && <WorkoutLogPage />}
      </div>
    </div>
  )
}
