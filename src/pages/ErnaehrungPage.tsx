import { useState } from 'react'
import NutritionPage from './NutritionPage'
import NutritionLogPage from './NutritionLogPage'
import SupplementPlanPage from './SupplementPlanPage'

const VIEWS = [
  { key: 'plan', label: 'Plan' },
  { key: 'log', label: 'Log' },
  { key: 'supplements', label: 'Supplements' },
] as const
type View = (typeof VIEWS)[number]['key']

export default function ErnaehrungPage() {
  const [view, setView] = useState<View>('plan')

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
      {view === 'plan' && <NutritionPage />}
      {view === 'log' && <NutritionLogPage />}
      {view === 'supplements' && <SupplementPlanPage />}
    </div>
  )
}
