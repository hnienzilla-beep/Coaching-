import { useState } from 'react'
import TrainingPlanPage from './TrainingPlanPage'
import WorkoutLogPage from './WorkoutLogPage'

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
      <div className="flex gap-1.5 rounded-xl bg-surface-2 p-1">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              view === v.key ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === 'plan' && <TrainingPlanPage />}
      {view === 'log' && <WorkoutLogPage />}
    </div>
  )
}
