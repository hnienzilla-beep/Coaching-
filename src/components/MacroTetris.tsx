import { suggestFill, type TetrisCandidate, type TetrisPart } from '../lib/macroTetris'
import { Button, Card } from './ui'

function amountLabel(grams: number): string {
  return `${grams.toLocaleString('de-DE', { maximumFractionDigits: 1 })} g`
}

/**
 * "Was noch passt": zwei, drei Vorschläge aus deinen üblichen Lebensmitteln, die den Rest des
 * Tages möglichst genau füllen - mit einem Tipp eingetragen.
 */
export default function MacroTetris({
  remaining,
  candidates,
  onAdd,
}: {
  remaining: { kcal: number; protein: number; carbs: number; fat: number }
  candidates: TetrisCandidate[]
  onAdd: (parts: TetrisPart[]) => Promise<void> | void
}) {
  // Rund 80 Mengen-Optionen, also ein paar tausend Paare - schnell genug für jeden Render.
  const suggestions = suggestFill(remaining, candidates)
  if (suggestions.length === 0) return null

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted">🧩 Was noch passt</h2>
        <span className="text-xs tabular-nums text-muted">
          Rest {Math.round(remaining.kcal)} kcal · P {Math.max(0, Math.round(remaining.protein))}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {suggestions.map((s) => (
          <div key={s.parts.map((p) => p.food.id + p.grams).join('+')} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-fg">
                {s.parts.map((p) => `${amountLabel(p.grams)} ${p.food.name}`).join(' + ')}
              </p>
              <p className="text-xs tabular-nums text-muted">
                {Math.round(s.totals.kcal)} kcal · P {Math.round(s.totals.protein)} · C {Math.round(s.totals.carbs)} · F{' '}
                {Math.round(s.totals.fat)}
              </p>
            </div>
            <Button variant="secondary" className="shrink-0 px-3" onClick={() => void onAdd(s.parts)} aria-label="Vorschlag eintragen">
              +
            </Button>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted">Aus deinen häufigsten Lebensmitteln und Favoriten, in deinen üblichen Mengen.</p>
    </Card>
  )
}
