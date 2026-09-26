// Umrechnung für die Farbkugel: Winkel = Farbton, Abstand zur Mitte = Sättigung (Mitte weiß),
// dazu ein Helligkeitsregler. HSV passt genau zu dieser Darstellung.

export type Hsv = { h: number; s: number; v: number }

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return `#${[f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`
}

export function hexToHsv(hex: string): Hsv {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.replace(/./g, (c) => c + c) : value.slice(0, 6)
  const [r, g, b] = [0, 2, 4].map((i) => (parseInt(full.slice(i, i + 2), 16) || 0) / 255)
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : d / max, v: max }
}

/** Punkt in der Kugel (relativ zur Mitte, Radius 1) → Farbton und Sättigung. */
export function pointToHueSat(x: number, y: number): { h: number; s: number } {
  // 0° oben, im Uhrzeigersinn - wie `conic-gradient`.
  const h = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360
  return { h, s: Math.min(1, Math.hypot(x, y)) }
}
