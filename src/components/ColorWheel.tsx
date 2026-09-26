import { useRef, useState } from 'react'
import { hexToHsv, hsvToHex, pointToHueSat, type Hsv } from '../lib/colorWheel'

const SIZE = 200

/**
 * Regenbogenkugel zur Wahl der Akzentfarbe: Ziehen oder Tippen wählt Farbton (Winkel) und
 * Sättigung (Abstand zur Mitte), der Regler darunter die Helligkeit. `onChange` läuft live beim
 * Ziehen (Vorschau), `onCommit` beim Loslassen (Speichern).
 */
export default function ColorWheel({
  value,
  onChange,
  onCommit,
}: {
  value: string
  onChange: (hex: string) => void
  onCommit: (hex: string) => void
}) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value))
  const wheelRef = useRef<HTMLDivElement>(null)
  const current = hsvToHex(hsv)

  function pick(e: React.PointerEvent): string {
    const rect = wheelRef.current!.getBoundingClientRect()
    const r = rect.width / 2
    const { h, s } = pointToHueSat((e.clientX - rect.left - r) / r, (e.clientY - rect.top - r) / r)
    const next = { ...hsv, h, s }
    setHsv(next)
    const hex = hsvToHex(next)
    onChange(hex)
    return hex
  }

  const angle = (hsv.h * Math.PI) / 180
  const knobX = SIZE / 2 + Math.sin(angle) * hsv.s * (SIZE / 2)
  const knobY = SIZE / 2 - Math.cos(angle) * hsv.s * (SIZE / 2)

  return (
    <div className="flex flex-col items-center gap-3" data-no-swipe>
      <div
        ref={wheelRef}
        role="slider"
        aria-label="Farbton und Sättigung"
        aria-valuenow={Math.round(hsv.h)}
        aria-valuemin={0}
        aria-valuemax={360}
        className="relative touch-none rounded-full shadow-lg shadow-black/40"
        style={{
          width: SIZE,
          height: SIZE,
          background:
            'radial-gradient(closest-side, #fff, rgba(255,255,255,0)), conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
          filter: `brightness(${0.35 + hsv.v * 0.65})`,
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pick(e)
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e)
        }}
        onPointerUp={(e) => onCommit(pick(e))}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-md shadow-black/50"
          style={{ left: knobX, top: knobY, background: current }}
        />
      </div>
      <label className="flex w-full items-center gap-3 text-xs text-muted">
        Hell
        <input
          type="range"
          min={40}
          max={100}
          value={Math.round(hsv.v * 100)}
          aria-label="Helligkeit"
          onChange={(e) => {
            const next = { ...hsv, v: Number(e.target.value) / 100 }
            setHsv(next)
            onChange(hsvToHex(next))
          }}
          onPointerUp={() => onCommit(current)}
          onKeyUp={() => onCommit(current)}
          className="flex-1 accent-[var(--color-accent)]"
        />
      </label>
    </div>
  )
}
