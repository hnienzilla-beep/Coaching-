// Versucht die Datei über die native Web-Share-Sheet zu teilen, fällt sonst auf einen
// klassischen Blob-Download zurück (z.B. Desktop-Browser ohne Web-Share-Unterstützung).
export async function shareOrDownloadFile(file: File): Promise<void> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return
    } catch {
      // Nutzer hat Teilen abgebrochen - fällt durch zum Download
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  URL.revokeObjectURL(url)
}
