import { CAL_TOLERANCE, MACRO_TOLERANCE, diffTone, diffToneClass, type MacroTarget, type Sums } from '../lib/macros'
import { useGrowIn } from '../lib/countUp'
import { Card, CountUp } from './ui'

const RING_SIZE = 150
const STROKE = 12
const RADIUS = (RING_SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function fraction(value: number, target: number): number {
  if (target <= 0) return 0
  return Math.max(0, Math.min(1, value / target))
}

function formatInt(n: number): string {
  return Math.round(n).toLocaleString('de-DE')
}

/**
 * Tagesübersicht des Ernährungslogs: ein Kalorien-Ring mit dem, was noch übrig ist, darunter
 * die drei Makros als kleine Karten. Ersetzt im Log die vier Balken untereinander - die
 * wichtigste Zahl ("wie viel darf ich noch?") steht so groß in der Mitte.
 */
export default function DailySummary({
  sums,
  target,
  evaluate = false,
}: {
  sums: Sums
  target: MacroTarget
  /** Ampelfarben erst für vergangene Tage - tagsüber liegt naturgemäß alles unter dem Ziel. */
  evaluate?: boolean
}) {
  const remaining = target.targetCalories - sums.kcal
  const over = remaining < 0
  const ringColor = evaluate
    ? diffTone(sums.kcal - target.targetCalories, CAL_TOLERANCE) === 'ok'
      ? 'var(--color-ok)'
      : 'var(--color-danger)'
    : over
      ? 'var(--color-danger)'
      : 'var(--color-accent)'
  // Ring und Balken starten bei 0 und wachsen auf ihren Wert - beim Hereinwischen sieht man
  // die Übersicht sich aufbauen.
  const grown = useGrowIn()
  const dash = grown ? CIRCUMFERENCE * fraction(sums.kcal, target.targetCalories) : 0

  return (
    <Card className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
        <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90" aria-hidden="true">
          <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RADIUS} fill="none" stroke="var(--color-surface-2)" strokeWidth={STROKE} />
          {/* Immer gezeichnet, damit die Transition auch greift, wenn die Daten erst nach dem
              ersten Render kommen - bei 0 unsichtbar, sonst bliebe das runde Linienende als Punkt. */}
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={ringColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
            strokeOpacity={dash > 0 ? 1 : 0}
            className="transition-[stroke-dasharray] duration-[900ms] ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className={`text-3xl font-bold tabular-nums ${over ? 'text-danger' : 'text-fg'}`}>
            <CountUp value={Math.abs(remaining)} />
          </span>
          <span className="text-xs text-muted">{over ? 'kcal drüber' : 'kcal übrig'}</span>
          <span className="mt-1 text-[11px] tabular-nums text-muted">
            <CountUp value={sums.kcal} /> / {formatInt(target.targetCalories)}
          </span>
        </div>
      </div>

      <div className="grid w-full grid-cols-3 gap-2">
        <MacroCard label="Protein" value={sums.protein} target={target.proteinG} evaluate={evaluate} grown={grown} delay={0} />
        <MacroCard label="Carbs" value={sums.carbs} target={target.carbsG} evaluate={evaluate} grown={grown} delay={80} />
        <MacroCard label="Fett" value={sums.fat} target={target.fatG} evaluate={evaluate} grown={grown} delay={160} />
      </div>
    </Card>
  )
}

function MacroCard({
  label,
  value,
  target,
  evaluate,
  grown,
  delay,
}: {
  label: string
  value: number
  target: number
  evaluate: boolean
  grown: boolean
  delay: number
}) {
  const rest = target - value
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-surface-2 px-2.5 py-2">
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <span className="text-sm tabular-nums">
        <span className={`font-semibold ${evaluate ? diffToneClass(value - target, MACRO_TOLERANCE) : 'text-fg'}`}><CountUp value={value} /></span>
        <span className="text-muted"> / {Math.round(target)} g</span>
      </span>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
          style={{ width: `${grown ? fraction(value, target) * 100 : 0}%`, transitionDelay: `${delay}ms` }}
        />
      </div>
      <span className="text-[11px] tabular-nums text-muted">
        {rest >= 0 ? `${Math.round(rest)} g übrig` : `${Math.round(-rest)} g drüber`}
      </span>
    </div>
  )
}
