import { useLocation, useSearchParams } from 'react-router-dom'
import NutritionPage from './NutritionPage'
import NutritionLogPage from './NutritionLogPage'
import SupplementPlanPage from './SupplementPlanPage'
import { SegmentedControl } from '../components/ui'
import { swipeAnimationClass } from '../lib/swipeNavigation'

// Das Log steht bewusst vorne und ist die Startansicht: Es ist die Ansicht, die im
// Alltag mehrmals täglich gebraucht wird, der Plan dagegen selten.
const VIEWS = [
  { key: 'log', label: 'Log' },
  { key: 'plan', label: 'Plan' },
  { key: 'supplements', label: 'Supplements' },
] as const
type View = (typeof VIEWS)[number]['key']

export default function ErnaehrungPage() {
  // Die Ansicht steht in der Adresse (`?view=plan`): So kann das Wischen zwischen allen
  // Ansichten der App wechseln, und "Log als Plan speichern" springt gezielt in den Plan.
  const [params, setParams] = useSearchParams()
  const { state } = useLocation()
  const view: View = VIEWS.find((v) => v.key === params.get('view'))?.key ?? 'log'

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl options={VIEWS} value={view} onChange={(v) => setParams({ view: v }, { replace: true })} />
      <div key={view} className={swipeAnimationClass((state as { swipe?: unknown } | null)?.swipe)}>
        {view === 'plan' && <NutritionPage />}
        {view === 'log' && <NutritionLogPage />}
        {view === 'supplements' && <SupplementPlanPage />}
      </div>
    </div>
  )
}
