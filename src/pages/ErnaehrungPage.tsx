import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import NutritionPage from './NutritionPage'
import NutritionLogPage from './NutritionLogPage'
import SupplementPlanPage from './SupplementPlanPage'
import { SegmentedControl } from '../components/ui'

// Das Log steht bewusst vorne und ist die Startansicht: Es ist die Ansicht, die im
// Alltag mehrmals täglich gebraucht wird, der Plan dagegen selten.
const VIEWS = [
  { key: 'log', label: 'Log' },
  { key: 'plan', label: 'Plan' },
  { key: 'supplements', label: 'Supplements' },
] as const
type View = (typeof VIEWS)[number]['key']

export default function ErnaehrungPage() {
  // "Log als Plan speichern" springt hierher zurück und will den frisch angelegten Plan
  // zeigen - dafür gibt es die gewünschte Ansicht im Navigations-State mit. Weil die Route
  // dabei dieselbe bleibt und die Seite nicht neu montiert, wird der Wunsch pro Navigation
  // (`key`) nachgezogen statt nur als Startwert gelesen.
  const { key, state } = useLocation()
  const requested = (state as { view?: View } | null)?.view
  const [view, setView] = useState<View>(requested ?? 'log')
  useEffect(() => {
    if (requested) setView(requested)
  }, [key, requested])

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl options={VIEWS} value={view} onChange={setView} />
      <div key={view} className="anim-page">
        {view === 'plan' && <NutritionPage />}
        {view === 'log' && <NutritionLogPage />}
        {view === 'supplements' && <SupplementPlanPage />}
      </div>
    </div>
  )
}
