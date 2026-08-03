import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getBackgroundPhoto } from '../db/queries'

export function BackgroundPhotoEffect() {
  const record = useLiveQuery(() => getBackgroundPhoto(), [])
  const [url, setUrl] = useState<string | undefined>(undefined)

  // Blob -> Object-URL Lebenszyklus: neu erzeugen nur wenn sich der Blob tatsächlich
  // ändert, alte URL beim Wechsel/Unmount immer über die Effekt-Cleanup freigeben.
  useEffect(() => {
    // Kein `instanceof Blob`-Check aus Prinzip: Ältere Backups enthielten das Foto als
    // leeres Objekt (siehe BACKUP_EXCLUDED_TABLES in db.ts). Ohne die Prüfung wirft
    // createObjectURL, und weil das im Effekt passiert, bliebe die ganze App weiß.
    if (!(record?.photo instanceof Blob)) {
      setUrl(undefined)
      return
    }
    const objectUrl = URL.createObjectURL(record.photo)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [record?.photo])

  // DOM-Seiteneffekt (Klasse + CSS-Variable) getrennt von der URL-Verwaltung oben.
  useEffect(() => {
    const root = document.documentElement
    if (url) {
      root.classList.add('bg-photo')
      root.style.setProperty('--bg-photo-url', `url(${JSON.stringify(url)})`)
    } else {
      root.classList.remove('bg-photo')
      root.style.removeProperty('--bg-photo-url')
    }
    return () => {
      root.classList.remove('bg-photo')
      root.style.removeProperty('--bg-photo-url')
    }
  }, [url])

  return url ? <div className="bg-photo-layer" aria-hidden="true" /> : null
}
