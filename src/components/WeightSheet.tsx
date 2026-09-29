import { useEffect, useState } from 'react'
import { calculateBodyFatFromFfmi } from '../lib/calculator'
import { upsertDailyEntry } from '../db/queries'
import { haptic } from '../lib/feedback'
import Sheet from './Sheet'
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
  const [weight, setWeight] = useState<number | undefined>(initial)
  // Beim Öffnen mit dem letzten Gewicht vorbelegen. `initial` ändert sich erst nach dem
  // Speichern, also nicht mitten im Tippen.
  useEffect(() => {
    if (open) setWeight(initial)
  }, [open, initial])

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
          value={weight}
          onChange={setWeight}
          autoFocus
          aria-label="Gewicht in kg"
          className="text-3xl! font-bold"
        />
        <span className="text-lg text-muted">kg</span>
      </div>
      <p className="text-xs text-muted">Wird wie im Tracking für heute gespeichert und fließt in Verlauf, BMI und Ø 7 Tage ein.</p>
    </Sheet>
  )
}

