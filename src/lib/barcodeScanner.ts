// Barcode per Handykamera lesen. Wo der Browser einen eigenen Erkenner hat (BarcodeDetector,
// z. B. Chrome auf Android), wird der genutzt; sonst - vor allem Safari auf dem iPhone - die
// Bibliothek ZXing. Die wird erst beim ersten Scannen nachgeladen, damit sie die App nicht
// für alle bremst.

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
type DetectorCtor = {
  new (options: { formats: string[] }): Detector
  getSupportedFormats?: () => Promise<string[]>
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

export type ScannerError = 'unsupported' | 'denied' | 'failed'

/** Verständliche Meldung zu einem Kamera-Fehler. */
export function scannerErrorText(error: ScannerError): string {
  if (error === 'unsupported') return 'Dieses Gerät oder dieser Browser erlaubt keinen Kamerazugriff.'
  if (error === 'denied') return 'Kein Zugriff auf die Kamera – bitte in den Einstellungen erlauben.'
  return 'Die Kamera ließ sich nicht starten.'
}

function classify(e: unknown): ScannerError {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  return 'failed'
}

const CAMERA: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
}

/**
 * Startet die Kamera im `video`-Element und meldet den ersten erkannten Barcode an `onCode`.
 * Liefert eine Stopp-Funktion (Kamera aus). Fehler kommen als `ScannerError` zurück.
 */
export async function startBarcodeScanner(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
): Promise<{ stop: () => void } | { error: ScannerError }> {
  if (!navigator.mediaDevices?.getUserMedia) return { error: 'unsupported' }

  const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
  const nativeFormats = Native?.getSupportedFormats ? await Native.getSupportedFormats().catch(() => []) : []
  if (Native && FORMATS.some((f) => nativeFormats.includes(f))) {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia(CAMERA)
    } catch (e) {
      return { error: classify(e) }
    }
    video.srcObject = stream
    video.setAttribute('playsinline', 'true')
    await video.play().catch(() => undefined)
    const detector = new Native({ formats: FORMATS.filter((f) => nativeFormats.includes(f)) })
    let stopped = false
    const loop = async () => {
      if (stopped) return
      try {
        const [hit] = await detector.detect(video)
        if (hit?.rawValue && !stopped) {
          onCode(hit.rawValue)
          return
        }
      } catch {
        // Einzelnes Bild nicht lesbar - einfach das nächste nehmen.
      }
      setTimeout(() => void loop(), 150)
    }
    void loop()
    return {
      stop: () => {
        stopped = true
        stream.getTracks().forEach((t) => t.stop())
        video.srcObject = null
      },
    }
  }

  try {
    const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ])
    const hints = new Map([
      [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]],
    ])
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 })
    let done = false
    const controls = await reader.decodeFromConstraints(CAMERA, video, (result) => {
      if (!result || done) return
      done = true
      onCode(result.getText())
    })
    return { stop: () => controls.stop() }
  } catch (e) {
    return { error: classify(e) }
  }
}
