// Wandelt eine ausgewählte Bilddatei in eine herunterskalierte Base64-Data-URL um.
// Die Data-URL wird direkt im Exercise-Datensatz gespeichert und läuft dadurch
// ohne Zusatzaufwand durch alle JSON-Export/Import-Wege. Das Herunterskalieren
// (max. maxSize Kantenlänge, JPEG) begrenzt die DB- und Dateigröße - anders als
// setBackgroundPhoto (src/db/queries.ts), das einen rohen Blob speichert.
export async function fileToResizedDataUrl(file: File, maxSize = 800, quality = 0.8): Promise<string> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar')
    ctx.drawImage(bitmap, 0, 0, width, height)

    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    bitmap.close()
  }
}
