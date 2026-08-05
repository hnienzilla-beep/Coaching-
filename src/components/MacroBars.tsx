import type { ReactNode } from 'react'
import { MACRO_TOLERANCE, diffToneClass, type MacroTarget, type Sums } from '../lib/macros'

function pct(value: number, target: number): number {
  if (target <= 0) return 0
  return Math.max(0, Math.min(100, (value / target) * 100))
}

// Die Balken tragen die Akzentfarbe des Athleten - dieselbe Farbe wie der aktive Tag in
// der Wochenleiste und die Primärknöpfe.
function Bar({ done, planned, target }: { done: number; planned: number; target: number }) {
  const donePct = pct(done, target)
  const plannedPct = Math.max(0, Math.min(100 - donePct, pct(planned, target) - donePct))
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
      <div className="h-full bg-accent" style={{ width: `${donePct}%` }} />
      <div className="h-full bg-accent/30" style={{ width: `${plannedPct}%` }} />
    </div>
  )
}

function MacroRow({
  label,
  done,
  planned,
  target,
  unit,
  tolerance,
  evaluate,
}: {
  label: string
  done: number
  planned: number
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
          <span className={evaluate ? diffToneClass(done - target, tolerance) : 'text-fg'}>{Math.round(done)}</span>
          <span className="text-muted">
            {planned > done ? ` (+${Math.round(planned - done)})` : ''} / {Math.round(target)} {unit}
          </span>
        </span>
      </div>
      <Bar done={done} planned={planned} target={target} />
    </div>
  )
}

const LOG_LEGEND = (
  <p className="text-[11px] leading-snug text-muted">
    <span className="inline-block h-2 w-2 rounded-full bg-accent align-middle" /> gegessen ·{' '}
    <span className="inline-block h-2 w-2 rounded-full bg-accent/30 align-middle" /> geplant – ins Tracking zählt nur, was
    abgehakt ist.
  </p>
)

function logRemainingText(remaining: number): string {
  return remaining >= 0 ? `Noch ${Math.round(remaining)} kcal übrig` : `${Math.round(-remaining)} kcal über dem Ziel`
}

/**
 * Tagesbilanz des Ernährungslogs. Der Balken trennt bewusst zwei Dinge, die vorher zu
 * einer Zahl verschmolzen waren: was tatsächlich gegessen (abgehakt) wurde - nur das
 * landet über `syncNutritionTotalsToDailyEntry` im Tracking - und was für den Tag zwar
 * eingeplant, aber noch nicht abgehakt ist.
 *
 * Der Ernährungsplan zeigt dieselbe Bilanz, kennt aber kein "gegessen": er übergibt für
 * `done` und `planned` denselben Wert und ersetzt Legende und Resttext über die Props.
 */
export default function MacroBars({
  done,
  planned,
  target,
  evaluate = false,
  legend = LOG_LEGEND,
  remainingText = logRemainingText,
}: {
  done: Sums
  planned: Sums
  target: MacroTarget
  /** Ampelfarben erst, wenn der Tag abgeschlossen ist - vorher liegt jeder Wert
   *  naturgemäß unter dem Ziel und wäre durchgehend rot. */
  evaluate?: boolean
  /** `null` blendet die Log-Legende aus (im Plan gibt es kein "gegessen"). */
  legend?: ReactNode | null
  remainingText?: (remaining: number) => string
}) {
  const remaining = target.targetCalories - done.kcal

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xl font-bold tabular-nums text-fg">{Math.round(done.kcal)}</span>
          <span className="text-sm text-muted tabular-nums">
            {planned.kcal > done.kcal ? `+${Math.round(planned.kcal - done.kcal)} geplant · ` : ''}
            Ziel {target.targetCalories} kcal
          </span>
        </div>
        <Bar done={done.kcal} planned={planned.kcal} target={target.targetCalories} />
        <p className="text-xs text-muted">{remainingText(remaining)}</p>
      </div>

      <div className="flex flex-col gap-2">
        <MacroRow label="Protein" done={done.protein} planned={planned.protein} target={target.proteinG} unit="g" tolerance={MACRO_TOLERANCE} evaluate={evaluate} />
        <MacroRow label="Carbs" done={done.carbs} planned={planned.carbs} target={target.carbsG} unit="g" tolerance={MACRO_TOLERANCE} evaluate={evaluate} />
        <MacroRow label="Fett" done={done.fat} planned={planned.fat} target={target.fatG} unit="g" tolerance={MACRO_TOLERANCE} evaluate={evaluate} />
      </div>

      {legend}
    </div>
  )
}
