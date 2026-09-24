import { MACRO_TOLERANCE, diffToneClass, type MacroTarget, type Sums } from '../lib/macros'

function pct(value: number, target: number): number {
  if (target <= 0) return 0
  return Math.max(0, Math.min(100, (value / target) * 100))
}

// Die Balken tragen die Akzentfarbe des Athleten - dieselbe Farbe wie der aktive Tag in
// der Wochenleiste und die Primärknöpfe.
function Bar({ value, target }: { value: number; target: number }) {
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
      <div className="h-full bg-accent" style={{ width: `${pct(value, target)}%` }} />
    </div>
  )
}

function MacroRow({
  label,
  value,
  target,
  unit,
  tolerance,
  evaluate,
}: {
  label: string
  value: number
  target: number
  unit: string
  tolerance: number
  evaluate: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums">
          <span className={evaluate ? diffToneClass(value - target, tolerance) : 'text-fg'}>{Math.round(value)}</span>
          <span className="text-muted">
            {' '}
            / {Math.round(target)} {unit}
          </span>
        </span>
      </div>
      <Bar value={value} target={target} />
    </div>
  )
}

function logRemainingText(remaining: number): string {
  return remaining >= 0 ? `Noch ${Math.round(remaining)} kcal übrig` : `${Math.round(-remaining)} kcal über dem Ziel`
}

/**
 * Tagesbilanz gegen das Ziel - im Ernährungslog zählt jeder Eintrag als gegessen, der
 * Ernährungsplan zeigt dieselbe Bilanz und ersetzt nur den Resttext über die Props.
 */
export default function MacroBars({
  sums,
  target,
  evaluate = false,
  remainingText = logRemainingText,
}: {
  sums: Sums
  target: MacroTarget
  /** Ampelfarben erst, wenn der Tag abgeschlossen ist - vorher liegt jeder Wert
   *  naturgemäß unter dem Ziel und wäre durchgehend rot. */
  evaluate?: boolean
  remainingText?: (remaining: number) => string
}) {
  const remaining = target.targetCalories - sums.kcal

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xl font-bold tabular-nums text-fg">{Math.round(sums.kcal)}</span>
          <span className="text-sm text-muted tabular-nums">Ziel {target.targetCalories} kcal</span>
        </div>
        <Bar value={sums.kcal} target={target.targetCalories} />
        <p className="text-xs text-muted">{remainingText(remaining)}</p>
      </div>

      <div className="flex flex-col gap-2">
        <MacroRow label="Protein" value={sums.protein} target={target.proteinG} unit="g" tolerance={MACRO_TOLERANCE} evaluate={evaluate} />
        <MacroRow label="Carbs" value={sums.carbs} target={target.carbsG} unit="g" tolerance={MACRO_TOLERANCE} evaluate={evaluate} />
        <MacroRow label="Fett" value={sums.fat} target={target.fatG} unit="g" tolerance={MACRO_TOLERANCE} evaluate={evaluate} />
      </div>
    </div>
  )
}
