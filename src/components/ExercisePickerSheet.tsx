import { useEffect, useMemo, useState } from 'react'
import type { Exercise } from '../models/types'
import Sheet from './Sheet'
import { Input, ListRow } from './ui'

/**
 * Übung auswählen - im Trainingslog und im Trainingsplan. Ersetzt die leeren Zeilen mit
 * eingebettetem Suchfeld: Erst wird gewählt, dann entsteht die Zeile.
 */
export default function ExercisePickerSheet({
  open,
  title,
  exercises,
  selectedId,
  onPick,
  onClose,
}: {
  open: boolean
  title: string
  exercises: Exercise[]
  selectedId?: string
  onPick: (exerciseId: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? exercises.filter((e) => e.name.toLowerCase().includes(q) || e.muscleGroup.toLowerCase().includes(q)) : exercises
    return [...list]
      .sort((a, b) => Number(b.favorite ?? false) - Number(a.favorite ?? false) || a.name.localeCompare(b.name, 'de'))
      .slice(0, 60)
  }, [exercises, query])

  return (
    <Sheet open={open} title={title} onClose={onClose} tall>
      <Input
        autoFocus
        type="search"
        placeholder="Übung oder Muskelgruppe suchen …"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Übung suchen"
      />
      <div className="flex flex-col gap-1.5">
        {matches.length === 0 && (
          <p className="px-1 text-sm text-muted">Keine Treffer – neue Übungen legst du in der Trainings-DB an.</p>
        )}
        {matches.map((e) => (
          <ListRow
            key={e.id}
            leading={
              e.imageDataUrl ? (
                <img src={e.imageDataUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
              ) : undefined
            }
            title={
              <>
                {e.favorite && '⭐ '}
                {e.name}
              </>
            }
            subtitle={e.muscleGroup}
            value={e.id === selectedId ? '✓' : undefined}
            onClick={() => {
              onPick(e.id)
              onClose()
            }}
          />
        ))}
      </div>
    </Sheet>
  )
}
