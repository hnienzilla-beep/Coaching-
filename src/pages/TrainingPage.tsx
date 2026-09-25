import { useState } from 'react'
import TrainingPlanPage from './TrainingPlanPage'
import WorkoutLogPage from './WorkoutLogPage'
import { SegmentedControl } from '../components/ui'

// Das Log steht bewusst vorne und ist die Startansicht: Es ist die Ansicht, die beim
// Training selbst gebraucht wird, der Plan dagegen selten.
const VIEWS = [
  { key: 'log', label: 'Log' },
  { key: 'plan', label: 'Plan' },
] as const
type View = (typeof VIEWS)[number]['key']

export default function TrainingPage() {
  const [view, setView] = useState<View>('log')

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl options={VIEWS} value={view} onChange={setView} />
      <div key={view} className="anim-page">
        {view === 'plan' && <TrainingPlanPage />}
        {view === 'log' && <WorkoutLogPage />}
      </div>
    </div>
  )
}
