import { useEffect, useRef, useState } from 'react'
import { scannerErrorText, startBarcodeScanner, type ScannerError } from '../lib/barcodeScanner'
import { normalizeBarcode } from '../lib/openFoodFacts'
import { Button, Input } from './ui'

/**
 * Kamerabild mit Zielrahmen: Sobald ein Barcode erkannt ist, geht die Kamera aus und `onCode`
 * läuft. Darunter lässt sich die Nummer auch eintippen - falls die Kamera nicht will oder der
 * Code zerknittert ist.
 */
export default function BarcodeScanner({ onCode }: { onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<ScannerError | null>(null)
  const [starting, setStarting] = useState(true)
  const [manual, setManual] = useState('')
  const onCodeRef = useRef(onCode)
  useEffect(() => {
    onCodeRef.current = onCode
  })

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let stop: (() => void) | undefined
    let cancelled = false
    void startBarcodeScanner(video, (code) => {
      stop?.()
      navigator.vibrate?.(40)
      onCodeRef.current(code)
    }).then((result) => {
      setStarting(false)
      if ('error' in result) {
        setError(result.error)
        return
      }
      // Sheet schon wieder zu, bevor die Kamera lief - dann sofort wieder aus.
      if (cancelled) result.stop()
      else stop = result.stop
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [])

  const manualCode = normalizeBarcode(manual)

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
        {!error && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-1/3 w-4/5 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
              <div className="scan-line absolute inset-x-3 top-1/2 h-0.5 rounded-full bg-accent shadow-[0_0_12px_var(--color-accent)]" />
            </div>
          </div>
        )}
        <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-6 text-center text-xs text-white">
          {error ? scannerErrorText(error) : starting ? 'Kamera startet …' : 'Barcode in den Rahmen halten'}
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (manualCode) onCode(manualCode)
        }}
      >
        <Input
          inputMode="numeric"
          placeholder="oder Barcode-Nummer eintippen"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          aria-label="Barcode-Nummer"
        />
        <Button type="submit" variant="secondary" disabled={!manualCode} className="shrink-0">
          Suchen
        </Button>
      </form>
    </div>
  )
}
