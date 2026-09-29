import { useEffect, useState } from 'react'
import { addDays, todayIso } from '../db/queries'
import Sheet from './Sheet'
import { mealLabel } from '../lib/prefs'
import { Button, Input } from './ui'

function dayLabel(iso: string): string {
  const today = todayIso()
  if (iso === today) return 'Heute'
  if (iso === addDays(today, 1)) return 'Morgen'
  if (iso === addDays(today, -1)) return 'Gestern'
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

/** Eine Mahlzeit in einen anderen Tag kopieren - Heute/Morgen mit einem Tipp, sonst per Datum. */
export default function CopyMealSheet({
  mealType,
  fromDate,
  onClose,
  onCopy,
}: {
  mealType: string | null
  fromDate: string
  onClose: () => void
  onCopy: (targetDate: string) => Promise<void> | void
}) {
  const today = todayIso()
  const [custom, setCustom] = useState(today)
  useEffect(() => setCustom(fromDate === today ? addDays(today, 1) : today), [fromDate, today, mealType])

  const quick = [today, addDays(today, 1)].filter((d) => d !== fromDate)

  async function copy(date: string) {
    await onCopy(date)
    onClose()
  }

  return (
    <Sheet open={mealType !== null} title={`„${mealType ? mealLabel(mealType) : ''}“ kopieren`} onClose={onClose}>
      <p className="text-sm text-muted">Alle Einträge dieser Mahlzeit werden in den gewählten Tag übernommen.</p>
      <div className="grid grid-cols-2 gap-2">
        {quick.map((d) => (
          <Button key={d} variant="primary" className="py-3" onClick={() => void copy(d)}>
            → {dayLabel(d)}
          </Button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input type="date" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Zieldatum" />
        <Button variant="secondary" className="shrink-0" disabled={!custom || custom === fromDate} onClick={() => void copy(custom)}>
          Kopieren
        </Button>
      </div>
    </Sheet>
  )
}
