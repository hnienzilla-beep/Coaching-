import { useLocation, useSearchParams } from 'react-router-dom'
import TrainingPlanPage from './TrainingPlanPage'
import WorkoutLogPage from './WorkoutLogPage'
import { SegmentedControl } from '../components/ui'
import { swipeAnimationClass } from '../lib/swipeNavigation'

// Das Log steht bewusst vorne und ist die Startansicht: Es ist die Ansicht, die beim
// Training selbst gebraucht wird, der Plan dagegen selten.
const VIEWS = [
  { key: 'log', label: 'Log' },
  { key: 'plan', label: 'Plan' },
] as const
type View = (typeof VIEWS)[number]['key']

export default function TrainingPage() {
  // Ansicht in der Adresse (`?view=plan`) - siehe ErnaehrungPage.
  const [params, setParams] = useSearchParams()
  const { state } = useLocation()
  const view: View = VIEWS.find((v) => v.key === params.get('view'))?.key ?? 'log'

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl options={VIEWS} value={view} onChange={(v) => setParams({ view: v }, { replace: true })} />
      <div key={view} className={swipeAnimationClass((state as { swipe?: unknown } | null)?.swipe)}>
        {view === 'plan' && <TrainingPlanPage />}
        {view === 'log' && <WorkoutLogPage />}
      </div>
    </div>
  )
}
