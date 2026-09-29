import type { Muscle } from '../lib/muscles'

export type Side = 'front' | 'back'
export type Sex = 'male' | 'female'
export type HeatMap = Partial<Record<Muscle, { level: number; glow: boolean }>>

/*
 * Anatomische Figur als SVG (200 × 440). Jede Muskelform ist nur für die linke Bildhälfte
 * gezeichnet und wird an der Mittelachse gespiegelt - so bleibt die Figur symmetrisch und die
 * Formen sind nur einmal zu pflegen. Mann und Frau unterscheiden sich in Schultern, Taille,
 * Hüfte und Brust.
 */

type Part = { muscle: Muscle; d: string }

const MALE_SILHOUETTE =
  'M100 58 L88 60 Q86 70 72 75 Q48 77 39 88 Q31 100 33 122 L35 160 Q29 200 27 238 Q24 262 29 276 L39 276 Q43 252 47 232 Q54 200 54 170 Q56 150 61 138 Q63 170 65 198 Q59 214 61 232 Q57 282 63 322 Q59 362 63 402 Q61 420 69 430 L94 430 Q92 412 94 402 Q98 362 94 322 Q98 282 98 242 L100 238 Z'

const MALE_FRONT: Part[] = [
  { muscle: 'Nacken/Trapez', d: 'M92 62 Q84 70 70 76 Q78 80 86 79 Q92 74 97 70 Z' },
  { muscle: 'Seitliche Schulter', d: 'M47 84 Q37 90 35 106 Q36 116 40 118 Q42 104 46 94 Q48 88 52 84 Z' },
  { muscle: 'Vordere Schulter', d: 'M68 80 Q56 79 49 86 Q45 96 45 110 Q51 106 56 98 Q61 90 70 86 Z' },
  { muscle: 'Brust', d: 'M98 84 Q86 80 72 84 Q60 90 57 104 Q57 118 66 126 Q80 134 98 130 Z' },
  { muscle: 'Seitlicher Bauch', d: 'M66 129 Q62 142 64 160 Q66 184 72 202 Q78 208 84 206 Q80 168 83 135 Q76 133 66 129 Z' },
  { muscle: 'Bauch', d: 'M98 134 L86 135 Q84 144 85 153 L98 153 Z' },
  { muscle: 'Bauch', d: 'M98 156 L85 156 Q84 165 85 174 L98 174 Z' },
  { muscle: 'Bauch', d: 'M98 177 L85 177 Q84 190 87 204 Q92 212 98 214 Z' },
  { muscle: 'Bizeps', d: 'M47 114 Q38 126 38 146 Q41 160 49 158 Q55 146 55 128 Q54 118 47 114 Z' },
  { muscle: 'Unterarme', d: 'M39 162 Q31 184 31 206 Q32 226 38 234 Q44 228 48 208 Q53 186 51 164 Q45 158 39 162 Z' },
  { muscle: 'Quadrizeps', d: 'M70 222 Q60 250 62 284 Q64 306 74 318 Q84 322 90 312 Q96 296 96 262 Q95 238 88 226 Q80 220 70 222 Z' },
  { muscle: 'Adduktoren', d: 'M97 236 Q99 258 96 282 Q92 268 90 250 Q91 240 97 236 Z' },
  { muscle: 'Waden', d: 'M68 336 Q62 356 64 380 Q68 398 74 400 Q78 388 78 360 Q78 344 74 334 Z' },
  { muscle: 'Waden', d: 'M86 338 Q92 350 92 370 Q90 390 86 396 Q82 380 82 360 Q82 346 86 338 Z' },
]

const MALE_BACK: Part[] = [
  { muscle: 'Nacken/Trapez', d: 'M100 60 L90 63 Q80 72 66 80 Q76 86 84 96 Q92 112 100 142 Z' },
  { muscle: 'Seitliche Schulter', d: 'M47 84 Q37 90 35 106 Q36 116 40 118 Q42 104 46 94 Q48 88 52 84 Z' },
  { muscle: 'Hintere Schulter', d: 'M66 82 Q54 80 49 88 Q45 98 46 108 Q53 102 58 96 Q62 90 70 88 Z' },
  { muscle: 'Trizeps', d: 'M47 112 Q38 124 38 144 Q40 158 48 158 Q55 146 55 128 Q55 118 47 112 Z' },
  { muscle: 'Unterarme', d: 'M39 162 Q31 184 31 206 Q32 226 38 234 Q44 228 48 208 Q53 186 51 164 Q45 158 39 162 Z' },
  { muscle: 'Latissimus', d: 'M84 100 Q72 98 64 106 Q60 124 62 146 Q66 170 76 186 Q86 194 98 196 L98 150 Q92 124 84 100 Z' },
  { muscle: 'Unterer Rücken', d: 'M98 198 Q88 196 80 190 Q78 202 82 212 Q90 218 98 218 Z' },
  { muscle: 'Po', d: 'M98 220 Q84 214 70 220 Q60 232 62 250 Q66 266 80 268 Q92 268 98 262 Z' },
  { muscle: 'Beinbeuger', d: 'M68 272 Q62 292 64 314 Q70 324 80 322 Q90 318 94 300 Q96 284 94 272 Q82 266 68 272 Z' },
  { muscle: 'Adduktoren', d: 'M97 270 Q98 286 96 302 Q93 292 92 280 Q93 272 97 270 Z' },
  { muscle: 'Waden', d: 'M66 334 Q58 352 62 374 Q68 388 76 384 Q80 366 79 344 Q76 334 66 334 Z' },
  { muscle: 'Waden', d: 'M81 336 Q89 342 89 362 Q87 380 81 386 Q80 362 81 336 Z' },
]

// Weibliche Figur aus der männlichen abgeleitet: Oberkörper schmaler, Hüfte und Oberschenkel
// breiter - mit weichem Übergang, damit keine Knicke entstehen. Brust eigens gezeichnet.
function femaleWidth(y: number): number {
  const top = 0.86
  const hip = 1.06
  if (y < 170) return top
  if (y < 215) return top + ((y - 170) / 45) * (hip - top)
  if (y < 300) return hip
  if (y < 340) return hip - ((y - 300) / 40) * (hip - 1)
  return 1
}

function morph(d: string, widthAt: (y: number) => number): string {
  const tokens = d.split(/\s+/)
  const out: string[] = []
  let pending: number | null = null
  for (const t of tokens) {
    const n = Number(t.replace(/^[A-Za-z]/, ''))
    const cmd = /^[A-Za-z]/.test(t) ? t[0] : ''
    if (t === 'Z' || t === '') {
      out.push(t)
      continue
    }
    if (pending === null) {
      pending = n
      out.push(`${cmd}__X__`)
    } else {
      const x = 100 - (100 - pending) * widthAt(n)
      out[out.length - 1] = out[out.length - 1].replace('__X__', String(Math.round(x * 10) / 10))
      out.push(String(n))
      pending = null
    }
  }
  return out.join(' ')
}

const FEMALE_CHEST = 'M98 92 Q86 88 76 94 Q68 102 70 116 Q76 128 88 128 Q95 126 98 122 Z'

const SILHOUETTE: Record<Sex, string> = { male: MALE_SILHOUETTE, female: morph(MALE_SILHOUETTE, femaleWidth) }
const FRONT: Record<Sex, Part[]> = {
  male: MALE_FRONT,
  female: MALE_FRONT.map((p) => (p.muscle === 'Brust' ? { ...p, d: FEMALE_CHEST } : { ...p, d: morph(p.d, femaleWidth) })),
}
const BACK: Record<Sex, Part[]> = {
  male: MALE_BACK,
  female: MALE_BACK.map((p) => ({ ...p, d: morph(p.d, femaleWidth) })),
}

/** Dekorative Linien (Knie, Wirbelsäule, Muskelfasern) - rein optisch, ohne Muskelzuordnung. */
const DETAILS: Record<Side, string> = {
  front: 'M73 326 Q81 334 89 326 M84 300 Q89 288 90 268',
  back: 'M100 144 L100 216 M72 328 Q81 322 90 328',
}

function fill(level: number | undefined): string {
  if (!level) return 'var(--color-surface-2)'
  const pct = Math.round(22 + level * 78)
  return `color-mix(in srgb, var(--color-accent) ${pct}%, var(--color-surface-2))`
}

export default function BodyFigure({
  side,
  sex,
  heat,
  grown,
  selected,
  onSelect,
  className = 'h-80 w-auto',
}: {
  side: Side
  sex: Sex
  heat: HeatMap
  /** Erst nach dem Einblenden färben - die Muskeln füllen sich dann nacheinander. */
  grown: boolean
  selected?: Muscle | null
  onSelect?: (muscle: Muscle) => void
  className?: string
}) {
  const parts = (side === 'front' ? FRONT : BACK)[sex]
  const renderParts = (mirror: boolean) =>
    parts.map((p, i) => {
      const h = heat[p.muscle]
      const isSelected = selected === p.muscle
      return (
        <path
          key={`${p.muscle}-${i}-${mirror}`}
          d={p.d}
          fill={grown ? fill(h?.level) : 'var(--color-surface-2)'}
          stroke={isSelected ? 'var(--color-fg)' : 'var(--color-bg)'}
          strokeWidth={isSelected ? 1.6 : 1}
          strokeLinejoin="round"
          className={`cursor-pointer ${grown && h?.glow ? 'muscle-glow' : ''}`}
          style={{ transition: 'fill 700ms ease-out, stroke 200ms', transitionDelay: `${i * 55}ms` }}
          onClick={onSelect ? () => onSelect(p.muscle) : undefined}
        >
          <title>{p.muscle}</title>
        </path>
      )
    })

  return (
    <svg viewBox="0 0 200 440" className={className} role="img" aria-label={`Körper ${side === 'front' ? 'vorne' : 'hinten'}`}>
      <g>
        <ellipse cx="100" cy="34" rx={sex === 'male' ? 19 : 17.5} ry="24" fill="color-mix(in srgb, var(--color-fg) 8%, var(--color-bg))" />
        <path d={SILHOUETTE[sex]} fill="color-mix(in srgb, var(--color-fg) 8%, var(--color-bg))" />
        <path d={SILHOUETTE[sex]} fill="color-mix(in srgb, var(--color-fg) 8%, var(--color-bg))" transform="translate(200 0) scale(-1 1)" />
      </g>
      <g>{renderParts(false)}</g>
      <g transform="translate(200 0) scale(-1 1)">{renderParts(true)}</g>
      <path d={DETAILS[side]} stroke="var(--color-bg)" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.8" />
    </svg>
  )
}
