import { useEffect, useState } from 'react'
import { calculateBodyFatFromFfmi } from '../lib/calculator'
import { upsertDailyEntry } from '../db/queries'
import { haptic } from '../lib/feedback'
import Sheet from './Sheet'
import { displayValue, useUnits } from '../lib/units'
import { Button, DecimalInput } from './ui'

/** Heutiges Gewicht eintragen - landet im selben Tageseintrag wie im Tracking. */
export default function WeightSheet({
  open,
  athleteId,
  date,
  initial,
  ffmi,
  heightCm,
  onClose,
}: {
  open: boolean
  athleteId: string
  date: string
  initial?: number
  ffmi?: number
  heightCm: number
  onClose: () => void
}) {
  // Eingabe in der eingestellten Einheit (kg/lbs), gespeichert wird in kg.
  const units = useUnits()
  const [shown, setShown] = useState<number | undefined>(units.show(initial, 'weight'))
  // Beim Öffnen mit dem letzten Gewicht vorbelegen. `initial` ändert sich erst nach dem
  // Speichern, also nicht mitten im Tippen.
  const unit = units.label('weight')
  useEffect(() => {
    if (open) setShown(displayValue(initial, 'weight'))
  }, [open, initial, unit])

  const weight = units.parse(shown, 'weight')
  const valid = weight !== undefined && weight > 20 && weight < 400
  async function save() {
    if (!valid) return
    // Mit FFMI ergibt sich der KFA des Tages aus dem neuen Gewicht - wie im Tracking.
    const kfa = ffmi !== undefined ? calculateBodyFatFromFfmi(ffmi, weight, heightCm) : undefined
    await upsertDailyEntry({
      id: crypto.randomUUID(),
      athleteId,
      date,
      weightKg: weight,
      ...(kfa !== undefined && Number.isFinite(kfa) ? { bodyFatPct: Math.round(kfa * 10) / 10 } : {}),
    })
    haptic('success')
    onClose()
  }

  return (
    <Sheet
      open={open}
      title="Gewicht heute"
      onClose={onClose}
      footer={
        <Button variant="primary" disabled={!valid} onClick={() => void save()}>
          Speichern
        </Button>
      }
    >
      <div className="flex items-baseline gap-2">
        <DecimalInput
          value={shown}
          onChange={setShown}
          autoFocus
          aria-label={`Gewicht in ${unit}`}
          className="text-3xl! font-bold"
        />
        <span className="text-lg text-muted">{unit}</span>
      </div>
      <p className="text-xs text-muted">Wird wie im Tracking für heute gespeichert und fließt in Verlauf, BMI und Ø 7 Tage ein.</p>
    </Sheet>
  )
}

