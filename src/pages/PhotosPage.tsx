import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Athlete, ProgressPhoto } from '../models/types'
import { Button, Card } from '../components/ui'

type Ctx = { athlete: Athlete }

function useObjectUrl(blob?: Blob): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])
  return url
}

export default function PhotosPage() {
  const { athlete } = useOutletContext<Ctx>()
  const photos = useLiveQuery(
    () => db.progressPhotos.where('athleteId').equals(athlete.id).sortBy('date'),
    [athlete.id],
  )
  const [selected, setSelected] = useState<string[]>([])

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id)
      if (prev.length >= 2) return [prev[1], id]
      return [...prev, id]
    })
  }

  const selectedPhotos = (photos ?? []).filter((p) => selected.includes(p.id)).sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="flex flex-col gap-4">
      {selectedPhotos.length === 2 && (
        <Card className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Vorher / Nachher</h2>
          <div className="grid grid-cols-2 gap-2">
            {selectedPhotos.map((p) => (
              <ComparisonImage key={p.id} photo={p} />
            ))}
          </div>
          <Button variant="ghost" onClick={() => setSelected([])}>
            Auswahl zurücksetzen
          </Button>
        </Card>
      )}

      <Card className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Galerie {photos?.length ? `(${photos.length})` : ''}
        </h2>
        {!photos?.length && <p className="text-sm text-muted">Noch keine Fotos. Füge im Tracking-Tab ein Foto zu einem Tag hinzu.</p>}
        <div className="grid grid-cols-3 gap-2">
          {photos?.map((p) => (
            <Thumb key={p.id} photo={p} isSelected={selected.includes(p.id)} onToggle={() => toggle(p.id)} />
          ))}
        </div>
      </Card>
    </div>
  )
}

function Thumb({ photo, isSelected, onToggle }: { photo: ProgressPhoto; isSelected: boolean; onToggle: () => void }) {
  const url = useObjectUrl(photo.blob)
  return (
    <button
      onClick={onToggle}
      className={`relative aspect-square overflow-hidden rounded-lg border-2 ${isSelected ? 'border-accent' : 'border-transparent'}`}
    >
      {url && <img src={url} alt={photo.date} className="h-full w-full object-cover" />}
      <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[10px] text-fg">{photo.date}</span>
    </button>
  )
}

function ComparisonImage({ photo }: { photo: ProgressPhoto }) {
  const url = useObjectUrl(photo.blob)
  return (
    <div className="flex flex-col gap-1">
      {url && <img src={url} alt={photo.date} className="aspect-square w-full rounded-lg object-cover" />}
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{photo.date}</span>
        <button
          className="text-danger"
          onClick={async () => {
            if (confirm('Foto löschen?')) await db.progressPhotos.delete(photo.id)
          }}
        >
          Löschen
        </button>
      </div>
    </div>
  )
}
